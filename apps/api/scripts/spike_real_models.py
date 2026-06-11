"""Validate Grounding DINO + SAM 2.1 via transformers against the test clip
before wiring into the job system. Writes visual checks to test-assets/."""
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import media  # noqa: E402
from app.vision import providers_real as real  # noqa: E402

CLIP = Path(__file__).resolve().parents[3] / "test-assets" / "test_clip.mp4"
OUT = Path(__file__).resolve().parents[3] / "test-assets"

print("cuda available:", real.available())
frames = [img for _, img in media.iter_video_frames(CLIP)]
print(f"{len(frames)} frames {frames[0].shape}")

# --- Grounding DINO ---
t0 = time.time()
boxes, scores, labels = real.dino_detect(frames[0], "red ball", 0.3)
print(f"DINO load+first inference: {time.time()-t0:.1f}s")
print("detections:", [(l, round(float(s), 3), [int(v) for v in b])
                      for b, s, l in zip(boxes, scores, labels)])
t0 = time.time()
real.dino_detect(frames[10], "red ball", 0.3)
print(f"DINO warm inference: {time.time()-t0:.2f}s")

vis = frames[0].copy()
for b in boxes:
    cv2.rectangle(vis, (int(b[0]), int(b[1])), (int(b[2]), int(b[3])), (0, 255, 0), 2)
cv2.imwrite(str(OUT / "spike_dino.png"), vis)

# --- SAM2 image ---
t0 = time.time()
mask, score = real.sam2_image_mask(frames[0], {
    "type": "click", "points": [{"x": 0.3, "y": 0.55, "positive": True}]})
print(f"SAM2 image: {time.time()-t0:.1f}s, score {score:.3f}, area {(mask>0).mean():.3f}")
cv2.imwrite(str(OUT / "spike_sam2_image.png"), mask)

# --- SAM2 video ---
sub = frames[:90]
t0 = time.time()
got = {}
for idx, m, conf in real.sam2_video_masks(sub, [
        {"type": "click", "points": [{"x": 0.3, "y": 0.55, "positive": True}]}]):
    got[idx] = m
dt = time.time() - t0
print(f"SAM2 video: {len(got)} masks in {dt:.1f}s ({len(got)/dt:.1f} fps)")
row = np.hstack([cv2.cvtColor(got[i], cv2.COLOR_GRAY2BGR) // 2 + sub[i] // 2
                 for i in (0, 40, 80) if i in got])
cv2.imwrite(str(OUT / "spike_sam2_video.png"), row)
print("spike artifacts written to test-assets/")
