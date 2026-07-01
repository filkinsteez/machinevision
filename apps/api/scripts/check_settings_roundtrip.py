"""In-process check that project settings (audioReactive) survive PATCH -> GET."""
from fastapi.testclient import TestClient

from app.main import app

c = TestClient(app)
proj = c.post("/api/projects", json={"name": "audio-settings-test"}).json()
pid = proj["id"]
try:
    cfg = {"enabled": True, "sensitivity": 1.5, "smoothing": 0.7,
           "bassGain": 2.0, "midGain": 1.0, "trebleGain": 1.0, "beatAmount": 1.2}
    c.patch(f"/api/projects/{pid}", json={"settings": {"audioReactive": cfg}})
    got = c.get(f"/api/projects/{pid}").json()["settings"]
    assert got.get("audioReactive") == cfg, got
    print("settings round-trip OK:", got)
finally:
    c.delete(f"/api/projects/{pid}")
    print("cleaned up throwaway project")
