"""Spike YOLO11x-pose vs MediaPipe on the real skate clip: people found per
frame, speed, and a rendered check frame with boxes + skeletons."""
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import media  # noqa: E402
from app.vision import providers_people as pp  # noqa: E402

proxies = list((Path(__file__).resolve().parents[3] / "data" / "storage" / "proxies").glob("*/proxy.*"))
clip = proxies[0]
print("clip:", clip, "| cuda:", pp.available())

pp.reset_tracker()
counts = []
t0 = time.time()
check = None
check_people = None
for idx, frame in media.iter_video_frames(clip):
    people = pp.track_frame(frame)
    counts.append(len(people))
    if idx == 120:
        check, check_people = frame.copy(), people
warm = time.time() - t0
n = len(counts)
print(f"{n} frames in {warm:.1f}s ({n/warm:.1f} fps) | people/frame: "
      f"min {min(counts)} max {max(counts)} mean {sum(counts)/n:.2f}")
ids = set()
for idx, frame in [(0, None)]:
    pass

# render the check frame
if check is not None:
    h, w = check.shape[:2]
    for p in check_people:
        x1, y1, x2, y2 = [int(v * (w if i % 2 == 0 else h)) for i, v in enumerate(p["bbox"])]
        cv2.rectangle(check, (x1, y1), (x2, y2), (0, 90, 255), 2)
        cv2.putText(check, f"person #{p['trackId']} {p['confidence']:.2f}", (x1, y1 - 6),
                    cv2.FONT_HERSHEY_PLAIN, 0.9, (0, 90, 255), 1)
        pts = p["points"]
        for a, b in pp.COCO_CONNECTIONS:
            if pts[a][3] > 0.3 and pts[b][3] > 0.3:
                cv2.line(check, (int(pts[a][0] * w), int(pts[a][1] * h)),
                         (int(pts[b][0] * w), int(pts[b][1] * h)), (80, 255, 80), 2)
        for pt in pts:
            if pt[3] > 0.3:
                cv2.circle(check, (int(pt[0] * w), int(pt[1] * h)), 2, (255, 255, 255), -1)
    out = Path(__file__).resolve().parents[3] / "test-assets" / "spike_people.png"
    cv2.imwrite(str(out), check)
    print("people on check frame:", len(check_people), "| wrote", out)
