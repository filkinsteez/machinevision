"""Replicate the depth_displace 'relief' shader in numpy on a real Sapiens depth
pass to confirm the displacement is meaningful (GLSL is verified separately in
the browser; this validates the math/visual)."""
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import media, storage  # noqa: E402
from app.vision import providers_sapiens  # noqa: E402

proxies = list((Path(__file__).resolve().parents[3] / "data" / "storage" / "proxies").glob("*/proxy.*"))
if not proxies:
    print("no proxy media in store")
    raise SystemExit(0)
frame_idx = 120
cap = cv2.VideoCapture(str(proxies[0]))
cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
ok, img = cap.read()
cap.release()
if not ok:
    print("could not read frame")
    raise SystemExit(0)
h, w = img.shape[:2]

# compute depth via the Sapiens provider (same as the job) and encode like the
# stored field: normalized per-frame, near = bright.
d = providers_sapiens.infer_depth(img)
d = cv2.resize(d, (w, h), interpolation=cv2.INTER_LINEAR)
lo, hi = np.percentile(d, [2, 98])
field = np.clip((d - lo) / (hi - lo + 1e-6), 0, 1)
field = 1.0 - field  # near = bright, matching run_sapiens

strength = 1.5
# gradient (matches shader: central difference)
dx = np.zeros_like(field); dy = np.zeros_like(field)
dx[:, 1:-1] = field[:, 2:] - field[:, :-2]
dy[1:-1, :] = field[2:, :] - field[:-2, :]
present = (field > 0.004).astype(np.float32)
amt = strength * 0.5
# per-pixel source coords displaced by gradient
ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
map_x = (xs + dx * amt * w * present).astype(np.float32)
map_y = (ys + dy * amt * h * present).astype(np.float32)
warped = cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

# how much did it actually move things
moved = float(np.mean(np.abs(warped.astype(int) - img.astype(int))))
print(f"frame {frame_idx}: mean |delta| = {moved:.2f} (0 = no effect)")

out = Path(__file__).resolve().parents[3] / "test-assets" / "depth_displace_check.png"
cv2.imwrite(str(out), np.hstack([img, cv2.applyColorMap((field * 255).astype(np.uint8),
            cv2.COLORMAP_INFERNO), warped]))
print("wrote", out, "(orig | depth | relief-displaced)")
