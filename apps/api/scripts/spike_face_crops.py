"""Old face path vs new YOLO-crop path on the crowd clip: coverage + a render."""
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import media  # noqa: E402
from app.vision import providers, providers_people  # noqa: E402

proxies = list((Path(__file__).resolve().parents[3] / "data" / "storage" / "proxies").glob("*/proxy.*"))
clip = proxies[0]
N = 240  # sample the first N frames

# ---- new path: YOLO heads -> mesh crops ----
providers_people.reset_tracker()
t0 = time.time()
new_counts = []
check = None
check_meshes = None
for idx, frame in media.iter_video_frames(clip):
    if idx >= N:
        break
    h, w = frame.shape[:2]
    people = providers_people.track_frame(frame)
    meshes = []
    heads = []
    for q in people:
        box = providers.head_box_from_pose(q["points"], w, h)
        if box:
            heads.append((box, box[2] - box[0]))
    heads.sort(key=lambda t: -t[1])
    for box, _ in heads[:8]:
        pts = providers.mesh_on_crop(frame, box)
        if pts is not None:
            meshes.append(pts)
    new_counts.append(len(meshes))
    if idx == 120:
        check, check_meshes = frame.copy(), meshes
dt_new = time.time() - t0

# ---- old path: MediaPipe VIDEO-mode detector ----
process, _conn, lm = providers.get_landmarker("face")
t0 = time.time()
old_counts = []
for idx, frame in media.iter_video_frames(clip):
    if idx >= N:
        break
    old_counts.append(len(process(frame, idx)))
lm.close()
dt_old = time.time() - t0

def stats(c):
    hit = sum(1 for v in c if v > 0)
    return f"frames with faces {hit}/{len(c)}, mean faces/frame {sum(c)/len(c):.2f}"

print(f"OLD (MediaPipe detector): {stats(old_counts)}  [{dt_old:.0f}s]")
print(f"NEW (YOLO heads + crops): {stats(new_counts)}  [{dt_new:.0f}s]")

if check is not None and check_meshes:
    h, w = check.shape[:2]
    conns = providers.face_connections()
    for pts in check_meshes:
        for a, b in conns[::3]:  # thinned tessellation for legibility
            cv2.line(check, (int(pts[a][0] * w), int(pts[a][1] * h)),
                     (int(pts[b][0] * w), int(pts[b][1] * h)), (80, 255, 80), 1)
    out = Path(__file__).resolve().parents[3] / "test-assets" / "spike_face_crops.png"
    cv2.imwrite(str(out), check)
    print(f"check frame: {len(check_meshes)} meshes | wrote {out}")
