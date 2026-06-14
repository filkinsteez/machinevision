"""E2E: Sapiens body_parts + depth + normals, then derive a hair mask."""
import sys
import time
from pathlib import Path

import httpx

c = httpx.Client(base_url="http://127.0.0.1:8000", timeout=120)
pid = c.get("/api/projects").json()[0]["id"]
assets = c.get(f"/api/projects/{pid}/assets").json()
if not assets:
    # upload the bird clip
    clip = Path(__file__).resolve().parents[3] / "test-assets" / "test_clip.mp4"
    with open(clip, "rb") as f:
        r = c.post(f"/api/projects/{pid}/assets",
                   files={"file": (clip.name, f, "video/mp4")}).json()
    aid = r["asset"]["id"]
    jid = r["job"]["id"]
    while c.get(f"/api/jobs/{jid}").json()["status"] not in ("ready", "failed"):
        time.sleep(1)
else:
    aid = assets[0]["id"]
print("asset:", aid, next(a["name"] for a in c.get(f"/api/projects/{pid}/assets").json() if a["id"] == aid))


def wait(jid, label, timeout=900):
    t0 = time.time()
    while True:
        j = c.get(f"/api/jobs/{jid}").json()
        if j["status"] in ("ready", "failed", "cancelled"):
            print(f"  {label}: {j['status']} {j.get('error') or ''} ({time.time()-t0:.0f}s)")
            assert j["status"] == "ready", j
            return
        if time.time() - t0 > timeout:
            sys.exit(f"{label} timeout at {j['stage']}")
        time.sleep(2)


bp_pass = None
for task in ("body_parts", "depth", "normals"):
    r = c.post("/api/vision/sapiens", json={"projectId": pid, "assetId": aid, "task": task}).json()
    if r.get("cached"):
        print(f"  {task}: cached")
        if task == "body_parts":
            bp_pass = r["pass"]["id"]
        continue
    wait(r["job"]["id"], task)
    vp = c.get(f"/api/vision/passes/{r['pass']['id']}").json()
    print(f"    {vp['summary']} | {vp['providerVersion']}")
    if task == "body_parts":
        bp_pass = r["pass"]["id"]
        data = c.get(vp["dataUrl"]).json()
        present = data.get("presentClasses", [])
        names = data.get("classNames", [])
        print("    present parts:", [names[i] for i in present if i < len(names)])

# derive a hair mask (class 3) + face (class 2)
r = c.post("/api/vision/body-part-mask", json={
    "projectId": pid, "bodyPartsPassId": bp_pass, "partIds": [2, 3]}).json()
if r.get("cached"):
    print("  body-part mask: cached")
else:
    wait(r["job"]["id"], "hair+face mask")
print("SAPIENS E2E OK")
