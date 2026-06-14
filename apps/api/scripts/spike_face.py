"""Does running face mesh on the full-res source + lower threshold catch more
faces than the 540p proxy on this GoPro clip?"""
import sys
from pathlib import Path

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python import vision as mpv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import storage  # noqa: E402
from app.db import Asset, SessionLocal  # noqa: E402
from app.vision import providers  # noqa: E402

with SessionLocal() as db:
    a = db.query(Asset).filter(Asset.status == "ready").first()
    src = storage.path_for(a.source_key)
    proxy = storage.path_for(a.proxy_key)
print("source:", a.width, "x", a.height, "| proxy:", a.proxy_width, "x", a.proxy_height)


def count_faces(video_path, conf, max_side=None):
    base = BaseOptions(model_asset_path=providers._landmark_model_path("face"))
    lm = mpv.FaceLandmarker.create_from_options(mpv.FaceLandmarkerOptions(
        base_options=base, running_mode=mpv.RunningMode.VIDEO, num_faces=5,
        min_face_detection_confidence=conf, min_face_presence_confidence=conf,
        min_tracking_confidence=conf))
    cap = cv2.VideoCapture(str(video_path))
    idx = 0
    hits = 0
    total_faces = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if max_side and max(frame.shape[:2]) > max_side:
            s = max_side / max(frame.shape[:2])
            frame = cv2.resize(frame, None, fx=s, fy=s)
        img = mp.Image(image_format=mp.ImageFormat.SRGB,
                       data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        res = lm.detect_for_video(img, idx * 33)
        if res.face_landmarks:
            hits += 1
            total_faces += len(res.face_landmarks)
        idx += 1
    lm.close()
    cap.release()
    return hits, idx, total_faces


for label, path, conf, ms in [
    ("proxy conf0.4", proxy, 0.4, None),
    ("proxy conf0.2", proxy, 0.2, None),
    ("source conf0.4", src, 0.4, 1280),
    ("source conf0.2", src, 0.2, 1280),
    ("source conf0.1", src, 0.1, 1280),
]:
    h, n, tf = count_faces(path, conf, ms)
    print(f"{label:18s}: {h}/{n} frames with face, {tf} total faces")
