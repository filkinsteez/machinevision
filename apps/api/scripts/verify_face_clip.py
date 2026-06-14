import time
from pathlib import Path

import cv2
import httpx

from app import media, storage
from app.db import Asset, SessionLocal

c = httpx.Client(base_url="http://127.0.0.1:8000", timeout=120)
pid = c.get("/api/projects").json()[0]["id"]
clip = Path(__file__).resolve().parents[3] / "test-assets" / "face_clip.mp4"

with open(clip, "rb") as f:
    r = c.post(f"/api/projects/{pid}/assets",
               files={"file": ("face_clip.mp4", f, "video/mp4")}).json()
aid = r["asset"]["id"]


def wait(jid, label):
    while True:
        j = c.get(f"/api/jobs/{jid}").json()
        if j["status"] in ("ready", "failed"):
            print(label, j["status"], j.get("error") or "")
            return j["status"] == "ready"
        time.sleep(1)


wait(r["job"]["id"], "ingest")
r = c.post("/api/vision/landmarks", json={"projectId": pid, "assetId": aid, "kind": "face"}).json()
wait(r["job"]["id"], "face")
vp = c.get(f"/api/vision/passes/{r['pass']['id']}").json()
print("summary:", vp["summary"])
data = c.get(vp["dataUrl"]).json()

hits = [f for f in data["frames"] if f.get("entities")]
if hits:
    f = hits[len(hits) // 2]
    with SessionLocal() as db:
        a = db.get(Asset, aid)
    img = media.read_frame(storage.path_for(a.proxy_key), f["frame"], (a.proxy_width, a.proxy_height))
    h, w = img.shape[:2]
    for ent in f["entities"]:
        for p in ent["points"]:
            cv2.circle(img, (int(p[0] * w), int(p[1] * h)), 1, (0, 255, 0), -1)
    out = Path(__file__).resolve().parents[3] / "test-assets" / "face_clip_check.png"
    cv2.imwrite(str(out), img)
    print("wrote", out, "| frame", f["frame"])

# clean up the test asset
c.delete(f"/api/assets/{aid}")
print("cleaned up test asset")
