"""Media pipeline: probing, proxy generation, thumbnails, frame iteration, encoding.

Everything goes through PyAV so no external FFmpeg binary is required.
Encoder choice is probed at runtime: the official PyAV wheels are a GPL FFmpeg
build that includes libx264, but we fall back to VP9/VP8-in-WebM if not.
"""
import functools
from fractions import Fraction
from pathlib import Path

import av
import cv2
import numpy as np


@functools.lru_cache(maxsize=None)
def _encoder_available(name: str) -> bool:
    try:
        av.codec.Codec(name, "w")
        return True
    except Exception:
        return False


@functools.lru_cache(maxsize=1)
def pick_encoder() -> tuple[str, str, str]:
    """Returns (codec_name, container_ext, mime) for browser-playable output."""
    if _encoder_available("libx264"):
        return ("libx264", "mp4", "video/mp4")
    if _encoder_available("libvpx-vp9"):
        return ("libvpx-vp9", "webm", "video/webm")
    if _encoder_available("libvpx"):
        return ("libvpx", "webm", "video/webm")
    raise RuntimeError("No browser-playable video encoder available in PyAV build")


def probe(path: Path) -> dict:
    """Extract media metadata. Returns dict with type/width/height/fps/duration/frameCount."""
    with av.open(str(path)) as container:
        vstreams = [s for s in container.streams if s.type == "video"]
        if not vstreams:
            raise ValueError("No video stream found")
        vs = vstreams[0]
        width, height = vs.codec_context.width, vs.codec_context.height
        duration = None
        if container.duration is not None:
            duration = container.duration / av.time_base
        elif vs.duration is not None and vs.time_base:
            duration = float(vs.duration * vs.time_base)
        fps = float(vs.average_rate) if vs.average_rate else None
        frame_count = vs.frames or 0
        is_image = (frame_count == 1) or (duration is None or duration < 0.04) and not fps
        if not frame_count and duration and fps:
            frame_count = int(round(duration * fps))
        return {
            "type": "image" if is_image or (frame_count <= 1 and (duration or 0) < 0.5) else "video",
            "width": width,
            "height": height,
            "fps": fps,
            "duration": duration,
            "frameCount": max(frame_count, 1),
        }


def probe_image(path: Path) -> dict | None:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        return None
    h, w = img.shape[:2]
    return {"type": "image", "width": w, "height": h, "fps": None, "duration": None, "frameCount": 1}


def proxy_size(width: int, height: int, max_h: int) -> tuple[int, int]:
    if height <= max_h:
        w, h = width, height
    else:
        w = int(round(width * max_h / height))
        h = max_h
    return (w // 2 * 2, h // 2 * 2)  # even dims for codecs


def iter_video_frames(path: Path, size: tuple[int, int] | None = None):
    """Yields (index, bgr ndarray). Decodes sequentially."""
    with av.open(str(path)) as container:
        vs = container.streams.video[0]
        vs.thread_type = "AUTO"
        idx = 0
        for frame in container.decode(vs):
            img = frame.to_ndarray(format="bgr24")
            if size is not None and (img.shape[1], img.shape[0]) != size:
                img = cv2.resize(img, size, interpolation=cv2.INTER_AREA)
            yield idx, img
            idx += 1


def read_frame(path: Path, frame_index: int, size: tuple[int, int] | None = None) -> np.ndarray:
    for idx, img in iter_video_frames(path, size):
        if idx >= frame_index:
            return img
    raise IndexError(f"frame {frame_index} out of range")


def has_audio(path: Path) -> bool:
    try:
        with av.open(str(path)) as c:
            return any(s.type == "audio" for s in c.streams)
    except Exception:
        return False


class VideoWriter:
    """Streaming encoder. Pass bgr ndarrays of constant size.

    `audio_from` declares an audio track up front (mp4 muxers require all
    streams before the header); call write_audio() after the video frames.
    """

    def __init__(self, path: Path, fps: float, size: tuple[int, int],
                 codec: str | None = None, bitrate: int = 6_000_000,
                 codec_options: dict | None = None, audio_from: Path | None = None):
        if codec is None:
            codec = pick_encoder()[0]
        path.parent.mkdir(parents=True, exist_ok=True)
        self.container = av.open(str(path), "w")
        rate = Fraction(fps).limit_denominator(1000) if fps else Fraction(30, 1)
        self.stream = self.container.add_stream(codec, rate=rate, options=codec_options or {})
        self.stream.width, self.stream.height = size
        self.stream.pix_fmt = "yuv420p"
        self.stream.bit_rate = bitrate
        if codec == "libx264" and not codec_options:
            self.stream.options = {"crf": "20", "preset": "veryfast"}

        self.audio_src: Path | None = None
        self.audio_stream = None
        if audio_from is not None and has_audio(audio_from):
            is_mp4 = str(path).lower().endswith((".mp4", ".mov"))
            acodec = "aac" if is_mp4 else "libopus"
            arate = 48000
            try:
                self.audio_stream = self.container.add_stream(acodec, rate=arate)
                self.audio_stream.bit_rate = 128_000
                self._aformat = "fltp" if acodec == "aac" else "flt"
                self._arate = arate
                self.audio_src = audio_from
            except Exception:
                self.audio_stream = None

    def write(self, bgr: np.ndarray):
        frame = av.VideoFrame.from_ndarray(bgr, format="bgr24")
        for packet in self.stream.encode(frame):
            self.container.mux(packet)

    def write_audio(self):
        """Transcode the audio track from audio_from into this container."""
        if self.audio_stream is None or self.audio_src is None:
            return
        resampler = av.AudioResampler(format=self._aformat, layout="stereo", rate=self._arate)
        with av.open(str(self.audio_src)) as inp:
            ais = next(s for s in inp.streams if s.type == "audio")
            for frame in inp.decode(ais):
                for f in resampler.resample(frame):
                    for packet in self.audio_stream.encode(f):
                        self.container.mux(packet)
        for packet in self.audio_stream.encode():
            self.container.mux(packet)

    def close(self):
        for packet in self.stream.encode():
            self.container.mux(packet)
        self.container.close()


def make_proxy(src: Path, dst_dir: Path, max_h: int, progress=None) -> dict:
    meta = probe(src)
    size = proxy_size(meta["width"], meta["height"], max_h)
    codec, ext, mime = pick_encoder()
    dst = dst_dir / f"proxy.{ext}"
    fps = meta["fps"] or 30.0
    writer = VideoWriter(dst, fps, size, audio_from=src)
    count = 0
    total = meta["frameCount"] or 1
    for idx, img in iter_video_frames(src, size):
        writer.write(img)
        count += 1
        if progress and idx % 30 == 0:
            progress(min(idx / total, 0.99), "encoding proxy")
    writer.write_audio()
    writer.close()
    return {"path": dst, "mime": mime, "width": size[0], "height": size[1],
            "fps": fps, "frameCount": count}


def make_thumbnail(src: Path, dst: Path, frame_index: int, height: int) -> Path:
    try:
        img = read_frame(src, frame_index)
    except Exception:
        img = read_frame(src, 0)
    h, w = img.shape[:2]
    tw = int(round(w * height / h))
    thumb = cv2.resize(img, (tw, height), interpolation=cv2.INTER_AREA)
    dst.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dst), thumb, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return dst
