import httpx

c = httpx.Client(base_url="http://127.0.0.1:8000", timeout=60)
pid = c.get("/api/projects").json()[0]["id"]
assets = c.get(f"/api/projects/{pid}/assets").json()
print("assets:", [(a["id"], a["name"], a["status"], a.get("frameCount")) for a in assets])

passes = c.get(f"/api/projects/{pid}/vision-passes").json()
for p in passes:
    if p["type"] == "face_landmarks":
        print("\nface pass:", p["id"], p["status"], p["summary"], "err:", p.get("error"))
        if p["status"] == "ready":
            data = c.get(p["dataUrl"]).json()
            hits = [f["frame"] for f in data["frames"] if f.get("entities")]
            print(f"  frames with a face: {len(hits)} / {len(data['frames'])}  -> {hits[:20]}")
            print("  connections:", len(data.get("connections", [])))

jobs = c.get(f"/api/projects/{pid}/jobs").json()
print("\nrecent landmark jobs:")
for j in jobs:
    if "landmark" in j["type"]:
        print(" ", j["status"], j["stage"], (j.get("error") or "")[:60])
