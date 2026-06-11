"""End-to-end vertical slice test (PRD §37.3 slice 1, stub providers):

upload video -> proxy -> click-prompt segmentation -> tracked mask pass
-> optical flow -> edge matte -> stub detection + ByteTrack -> codec datamosh
-> mask sequence + metadata exports.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app import storage  # noqa: E402

CLIP = Path(__file__).resolve().parents[3] / "test-assets" / "test_clip.mp4"
client = TestClient(app)


def wait_job(job_id: str, label: str, timeout=600):
    t0 = time.time()
    while True:
        j = client.get(f"/api/jobs/{job_id}").json()
        if j["status"] in ("ready", "failed", "cancelled"):
            assert j["status"] == "ready", f"{label} job {j['status']}: {j.get('error')}"
            print(f"  [ok] {label} ({time.time() - t0:.1f}s)")
            return j
        if time.time() - t0 > timeout:
            raise TimeoutError(f"{label} timed out at stage {j.get('stage')}")
        time.sleep(0.5)


print("== create project")
proj = client.post("/api/projects", json={"name": "Smoke Test"}).json()
pid = proj["id"]

print("== upload + ingest")
with open(CLIP, "rb") as f:
    r = client.post(f"/api/projects/{pid}/assets",
                    files={"file": ("test_clip.mp4", f, "video/mp4")}).json()
asset_id = r["asset"]["id"]
wait_job(r["job"]["id"], "ingest")
asset = client.get(f"/api/assets/{asset_id}").json()
assert asset["status"] == "ready" and asset["proxyUrl"], asset
print(f"  asset: {asset['frameCount']} frames {asset['proxyWidth']}x{asset['proxyHeight']} {asset['proxyMime']}")

print("== segmentation (click prompt at subject)")
r = client.post("/api/vision/segment", json={
    "projectId": pid, "assetId": asset_id,
    "prompt": {"type": "click", "points": [{"x": 0.3, "y": 0.55, "positive": True}]},
}).json()
mask_pass = r["pass"]["id"]
wait_job(r["job"]["id"], "segment")
vp = client.get(f"/api/vision/passes/{mask_pass}").json()
assert vp["status"] == "ready", vp
print(f"  mask pass: {vp['summary']}")
mask0 = storage.path_for(f"vision-passes/{mask_pass}/masks/000000.png")
assert mask0.exists() and mask0.stat().st_size > 0

print("== cache hit check")
r2 = client.post("/api/vision/segment", json={
    "projectId": pid, "assetId": asset_id,
    "prompt": {"type": "click", "points": [{"x": 0.3, "y": 0.55, "positive": True}]},
}).json()
assert r2["cached"] is True, "expected cached pass"
print("  [ok] identical prompt returned cached pass")

print("== optical flow")
r = client.post("/api/vision/optical-flow", json={"projectId": pid, "assetId": asset_id}).json()
flow_pass = r["pass"]["id"]
wait_job(r["job"]["id"], "optical flow")
print(f"  flow: {client.get(f'/api/vision/passes/{flow_pass}').json()['summary']}")

print("== edge matte")
r = client.post("/api/vision/edge-matte", json={"projectId": pid, "maskPassId": mask_pass}).json()
wait_job(r["job"]["id"], "edge matte")

print("== detection + tracking (stub)")
r = client.post("/api/vision/detect", json={"projectId": pid, "assetId": asset_id,
                                            "prompt": "the subject", "threshold": 0.5}).json()
wait_job(r["job"]["id"], "detect")
det = client.get(f"/api/vision/passes/{r['pass']['id']}").json()
print(f"  detection: {det['summary']}")
if r.get("trackPassId"):
    tp = client.get(f"/api/vision/passes/{r['trackPassId']}").json()
    print(f"  tracking: {tp['status']} {tp.get('summary')}")

print("== codec datamosh (subject mode)")
r = client.post("/render/datamosh".replace("/render", "/api/render"), json={
    "projectId": pid, "assetId": asset_id, "maskPassId": mask_pass,
    "params": {"mode": "subject", "strength": 0.9, "keyframeDistance": 15,
               "dupEvery": 30, "dupCount": 2, "seed": 1234},
}).json()
wait_job(r["job"]["id"], "datamosh", timeout=900)
exp = client.get(f"/api/exports/{r['export']['id']}").json()
out = storage.path_for(exp["outputUrl"].removeprefix("/storage/"))
assert out.exists() and out.stat().st_size > 10_000, exp
print(f"  baked: {exp['outputUrl']} ({out.stat().st_size // 1024} KB)")
print(f"  manifest outputs: {list(exp['manifest']['outputs'])}")

print("== mask sequence export")
r = client.post("/api/exports", json={"projectId": pid, "type": "mask_sequence",
                                      "passId": mask_pass}).json()
wait_job(r["job"]["id"], "mask zip")

print("== metadata export")
r = client.post("/api/exports", json={"projectId": pid, "type": "metadata"}).json()
wait_job(r["job"]["id"], "metadata")

print("== project json + presets")
pj = client.get(f"/api/projects/{pid}/export-json").json()
assert len(pj["visionPasses"]) >= 4
presets = client.get("/api/presets").json()
assert len(presets) >= 9
print(f"  {len(pj['visionPasses'])} passes, {len(presets)} presets")

print("\nALL SMOKE TESTS PASSED")
