"""E2E: upload face clip -> face landmarks job -> stored pass JSON must contain
478 points per entity (mesh + iris) — the data the Gaze overlay derives from."""
import time
from pathlib import Path

import httpx

c = httpx.Client(base_url="http://127.0.0.1:8010", timeout=120)
pid = c.get("/api/projects").json()[0]["id"]
clip = Path(__file__).resolve().parents[3] / "test-assets" / "face_clip.mp4"

with open(clip, "rb") as f:
    r = c.post(f"/api/projects/{pid}/assets",
               files={"file": ("gaze_check.mp4", f, "video/mp4")}).json()
aid = r["asset"]["id"]
try:
    def wait(jid, label):
        while True:
            j = c.get(f"/api/jobs/{jid}").json()
            if j["status"] in ("ready", "failed"):
                assert j["status"] == "ready", (label, j.get("error"))
                return
            time.sleep(1)

    wait(r["job"]["id"], "ingest")
    r2 = c.post("/api/vision/landmarks", json={"projectId": pid, "assetId": aid, "kind": "face"}).json()
    if not r2.get("cached"):
        wait(r2["job"]["id"], "face landmarks")
    data = c.get(c.get(f"/api/vision/passes/{r2['pass']['id']}").json()["dataUrl"]).json()
    hit = next(f for f in data["frames"] if f.get("entities"))
    n = len(hit["entities"][0]["points"])
    print(f"face pass entity points: {n}")
    assert n >= 478, "iris landmarks missing from stored pass"
    # sanity: iris (468) sits between the eye corners (33, 133)
    pts = hit["entities"][0]["points"]
    ix = pts[468][0]
    lo, hi = sorted([pts[33][0], pts[133][0]])
    assert lo - 0.02 <= ix <= hi + 0.02, f"iris x {ix} outside eye span [{lo},{hi}]"
    print(f"iris x={ix:.3f} within eye span [{lo:.3f},{hi:.3f}] — GAZE CHAIN OK")
finally:
    c.delete(f"/api/assets/{aid}")
    print("cleaned up test asset")
