"""Generate a synthetic test clip: a textured moving subject over a drifting
textured background — enough structure for GrabCut, CSRT, flow, and datamosh."""
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.media import VideoWriter  # noqa: E402

OUT = Path(__file__).resolve().parents[3] / "test-assets" / "test_clip.mp4"
OUT.parent.mkdir(parents=True, exist_ok=True)

W, H, FPS, SECONDS = 640, 360, 30, 6
rng = np.random.default_rng(7)

bg = rng.integers(40, 110, (H * 2, W * 2, 3), dtype=np.uint8)
bg = cv2.GaussianBlur(bg, (0, 0), 3)
for i in range(0, W * 2, 48):  # vertical structure so flow/mosh have edges
    cv2.line(bg, (i, 0), (i, H * 2), (int(70 + (i * 7) % 90),) * 3, 2)

tex = rng.integers(0, 255, (160, 160), dtype=np.uint8)
tex = cv2.GaussianBlur(tex, (0, 0), 2)

writer = VideoWriter(OUT, FPS, (W, H))
N = FPS * SECONDS
for t in range(N):
    ox = int((np.sin(t / N * 2 * np.pi) * 0.5 + 0.5) * W)
    oy = int((np.cos(t / N * 4 * np.pi) * 0.5 + 0.5) * H * 0.3)
    frame = bg[oy:oy + H, ox:ox + W].copy()

    cx = int(W * (0.25 + 0.5 * t / N))
    cy = int(H * (0.5 + 0.18 * np.sin(t / 12)))
    r = 58
    blob = np.zeros((H, W), np.uint8)
    cv2.circle(blob, (cx, cy), r, 255, -1)
    cv2.ellipse(blob, (cx, cy + r), (r // 2, r), 0, 0, 360, 255, -1)
    ys, xs = np.where(blob > 0)
    txs, tys = (xs - cx + 80) % 160, (ys - cy + 80) % 160
    subject = np.zeros_like(frame)
    subject[ys, xs, 2] = np.clip(tex[tys, txs] * 0.6 + 120, 0, 255)  # warm subject
    subject[ys, xs, 1] = tex[tys, txs] // 3
    subject[ys, xs, 0] = tex[tys, txs] // 4
    m = (blob > 0)[..., None]
    frame = np.where(m, subject, frame)
    writer.write(frame)
writer.close()
print(f"wrote {OUT} ({N} frames {W}x{H}@{FPS})")
