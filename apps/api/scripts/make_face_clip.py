"""Build a short test clip from a real public-domain face (NASA astronaut),
with slight motion, to validate face mesh + the pose gate."""
import sys
import urllib.request
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.media import VideoWriter  # noqa: E402

OUT = Path(__file__).resolve().parents[3] / "test-assets" / "face_clip.mp4"
URLS = [
    "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/lena.jpg",
    "https://github.com/scikit-image/scikit-image/raw/v0.24.0/skimage/data/astronaut.png",
]

tmp = OUT.parent / "face_src.png"
if not tmp.exists():
    req = None
    for u in URLS:
        try:
            urllib.request.urlretrieve(u, tmp)
            req = u
            break
        except Exception as e:
            print("failed", u, e)
    if req is None:
        raise SystemExit("could not fetch a face image")
    print("fetched", req)
img = cv2.imread(str(tmp))  # 512x512, face upper-left-ish
# place the face on a 960x540 canvas with a slow horizontal drift
H, W = 540, 960
writer = VideoWriter(OUT, 30, (W, H))
N = 60
for t in range(N):
    canvas = np.full((H, W, 3), 30, np.uint8)
    dx = int((t / N) * 120) - 60
    x0 = (W - img.shape[1]) // 2 + dx
    y0 = (H - img.shape[0]) // 2
    x0 = max(0, min(x0, W - img.shape[1]))
    canvas[y0:y0 + img.shape[0], x0:x0 + img.shape[1]] = img
    writer.write(canvas)
writer.close()
print("wrote", OUT, N, "frames")
