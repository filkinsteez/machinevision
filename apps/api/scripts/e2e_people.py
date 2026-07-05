"""E2E: /api/vision/people on the current asset -> boxes + poses passes."""
import time

import httpx

c = httpx.Client(base_url="http://127.0.0.1:8010", timeout=120)
pid = c.get("/api/projects").json()[0]["id"]
aid = c.get(f"/api/projects/{pid}/assets").json()[0]["id"]

r = c.post("/api/vision/people", json={"projectId": pid, "assetId": aid}).json()
if r.get("cached"):
    print("cached:", r["pass"]["id"], r["posePassId"])
else:
    jid = r["job"]["id"]
    t0 = time.time()
    while True:
        j = c.get(f"/api/jobs/{jid}").json()
        if j["status"] in ("ready", "failed"):
            print(f"job {j['status']} in {time.time()-t0:.0f}s", j.get("error") or "")
            assert j["status"] == "ready"
            break
        time.sleep(2)

det = c.get(f"/api/vision/passes/{r['pass']['id']}").json()
pose = c.get(f"/api/vision/passes/{r['posePassId']}").json()
print("boxes:", det["summary"], "|", det["providerVersion"])
print("poses:", pose["summary"], "|", pose["providerVersion"])
data = c.get(pose["dataUrl"]).json()
assert len(data["connections"]) == 18, "COCO skeleton missing"
sample = next(f for f in data["frames"] if f["entities"])
print(f"sample frame {sample['frame']}: {len(sample['entities'])} skeletons, "
      f"{len(sample['entities'][0]['points'])} keypoints each")
print("PEOPLE E2E OK")
