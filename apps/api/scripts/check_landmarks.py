import time

import httpx

c = httpx.Client(base_url="http://127.0.0.1:8000", timeout=120)
pid = c.get("/api/projects").json()[0]["id"]
aid = c.get(f"/api/projects/{pid}/assets").json()[0]["id"]

jobs = c.get(f"/api/projects/{pid}/jobs").json()
failed = [(j["id"], j["type"], (j.get("error") or "")[:60]) for j in jobs if j["status"] == "failed"]
print("failed jobs in DB:", failed)

for kind in ("face", "pose", "hands"):
    r = c.post("/api/vision/landmarks", json={"projectId": pid, "assetId": aid, "kind": kind}).json()
    if r.get("cached"):
        vp = c.get(f"/api/vision/passes/{r['pass']['id']}").json()
        print(kind, "cached ->", vp["status"], vp["summary"])
        continue
    jid = r["job"]["id"]
    while True:
        j = c.get(f"/api/jobs/{jid}").json()
        if j["status"] in ("ready", "failed"):
            break
        time.sleep(1.5)
    vp = c.get(f"/api/vision/passes/{r['pass']['id']}").json()
    print(kind, j["status"], j.get("error") or "", "|", vp["summary"])
