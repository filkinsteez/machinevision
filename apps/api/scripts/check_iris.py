"""Does our FaceLandmarker bundle output iris landmarks (478 pts) — i.e. can we
derive gaze from data we already compute? Also sanity-check a gaze vector."""
import sys
import urllib.request
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.vision import providers  # noqa: E402

# reuse the cached face test image (lena) or fetch it
img_path = Path(__file__).resolve().parents[3] / "test-assets" / "face_src.png"
if not img_path.exists():
    urllib.request.urlretrieve(
        "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/lena.jpg", img_path)
img = cv2.imread(str(img_path))

process, connections, lm = providers.get_landmarker("face")
entities = process(img, 0)
lm.close()
if not entities:
    print("NO FACE FOUND")
    raise SystemExit(1)

pts = entities[0]["points"]
print(f"landmarks per face: {len(pts)}  (468 = mesh only, 478 = mesh + iris)")
if len(pts) >= 478:
    h, w = img.shape[:2]
    def px(i):
        return np.array([pts[i][0] * w, pts[i][1] * h])
    # iris centers: 468 (right eye in image), 473 (left). Eye corners:
    # right eye 33 (outer) 133 (inner); left eye 362 (inner) 263 (outer)
    for label, iris_i, c1, c2 in (("R", 468, 33, 133), ("L", 473, 362, 263)):
        iris, a, b = px(iris_i), px(c1), px(c2)
        center = (a + b) / 2
        width = np.linalg.norm(b - a)
        off = (iris - center) / max(width, 1e-6)  # normalized offset in eye frame
        print(f"eye {label}: iris offset (x,y) = ({off[0]:+.3f}, {off[1]:+.3f})  [0,0 = looking at camera]")
    print("IRIS PRESENT -> gaze derivable from existing pass data")
else:
    print("iris NOT in bundle — would need the refined model")
