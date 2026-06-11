"""E2E against the live server: upload, text-prompted SAM2 mask, DINO detection."""
import sys
import time
from pathlib import Path

import httpx

base = "http://127.0.0.1:8000"
c = httpx.Client(base_url=base, timeout=60)
pid = c.get("/api/projects").json()[0]["id"]
clip = Path(__file__).resolve().parents[3] / "test-assets" / "test_clip.mp4"

with open(clip, "rb") as f:
    r = c.post(f"/api/projects/{pid}/assets",
               files={"file": ("test_clip.mp4", f, "video/mp4")}).json()
aid = r["asset"]["id"]


def wait(jid, label, timeout=600):
    t0 = time.time()
    while True:
        j = c.get(f"/api/jobs/{jid}").json()
        if j["status"] in ("ready", "failed", "cancelled"):
            print(label, j["status"], j.get("error") or "")
            assert j["status"] == "ready", j
            return time.time() - t0
        if time.time() - t0 > timeout:
            sys.exit(f"{label} timeout at {j['stage']}")
        time.sleep(1)


wait(r["job"]["id"], "ingest")

r = c.post("/api/vision/segment", json={
    "projectId": pid, "assetId": aid,
    "prompt": {"type": "text", "text": "red ball"}}).json()
dt = wait(r["job"]["id"], "text-mask")
vp = c.get(f"/api/vision/passes/{r['pass']['id']}").json()
print(f"  {dt:.1f}s | {vp['providerVersion']} | {vp['summary']}")
mask_pass = r["pass"]["id"]

r = c.post("/api/vision/detect", json={
    "projectId": pid, "assetId": aid, "prompt": "red ball", "threshold": 0.3}).json()
dt = wait(r["job"]["id"], "dino-detect")
vp = c.get(f"/api/vision/passes/{r['pass']['id']}").json()
print(f"  {dt:.1f}s | {vp['providerVersion']} | {vp['summary']}")

print("E2E GPU PIPELINE OK — asset:", aid, "mask:", mask_pass)
