"""Verify Sapiens presets seed and expose with correct pass-type requirements,
and that their layer source placeholders resolve to the right pass types."""
from fastapi.testclient import TestClient

from app.main import app  # importing triggers seed_presets()

c = TestClient(app)
presets = {p["name"]: p for p in c.get("/api/presets").json()}

expected = {
    "Depth Relief": ["depth"],
    "Depth Fog": ["depth"],
    "Surface Relief": ["normals"],
    "Body Part Field": ["body_parts"],
    "Isolate Hair": ["body_parts"],
}
for name, req in expected.items():
    assert name in presets, f"missing preset {name}"
    p = presets[name]
    assert p["requiredPassTypes"] == req, (name, p["requiredPassTypes"])
    # every layer source placeholder must reference one of the required types
    for layer in p["renderLayers"]:
        for key, val in layer["sources"].items():
            if val and val.startswith("$"):
                assert val[1:] in req, f"{name}: {key}={val} not in {req}"
    print(f"  {name}: req={req} layers={[l['type'] for l in p['renderLayers']]}")

print(f"OK — {len(presets)} presets total, all Sapiens presets valid")
