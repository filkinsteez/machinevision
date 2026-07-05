"""Real model providers (IMPLEMENTATION_PLAN Phase 5): Grounding DINO for
open-vocabulary detection, SAM 2.1 for image segmentation and video masklet
propagation. Loaded lazily, used only when CUDA is available; the stub roster
in providers.py remains the fallback. GPU work is serialized behind one lock
(the job pool runs two worker threads).
"""
import threading

import cv2
import numpy as np

DINO_MODEL_ID = "IDEA-Research/grounding-dino-base"
SAM2_MODEL_ID = "facebook/sam2.1-hiera-small"

_lock = threading.RLock()
_state: dict = {}


def available() -> bool:
    if "available" not in _state:
        try:
            import torch
            _state["available"] = bool(torch.cuda.is_available())
        except Exception:
            _state["available"] = False
    return _state["available"]


def versions() -> dict:
    import torch
    import transformers
    return {
        "dino": f"{DINO_MODEL_ID} (transformers {transformers.__version__})",
        "sam2": f"{SAM2_MODEL_ID} (transformers {transformers.__version__}, torch {torch.__version__})",
    }


def pick_gpu() -> int:
    """Pick a CUDA device. Free memory decides, but near-ties go to the HIGHEST
    index: apps like ComfyUI default to device 0 and lazily load/unload, so a
    startup free-memory snapshot is a race — device 0 can look empty and fill
    later. MI_GPU env var overrides. (mem_get_info must run inside each
    device's context or it reports the current device for all.)"""
    import os

    import torch
    forced = os.environ.get("MI_GPU")
    if forced is not None and forced.isdigit():
        print(f"[machine.industries] GPU pick: cuda:{forced} (MI_GPU override)")
        return int(forced)
    stats = []
    for i in range(torch.cuda.device_count()):
        with torch.cuda.device(i):
            free, _total = torch.cuda.mem_get_info()
        stats.append((free, i))
    # sort by free desc; treat within-2GB as a tie broken by higher index
    stats.sort(key=lambda s: (-round(s[0] / 2e9), -s[1]))
    free, best = stats[0]
    print(f"[machine.industries] GPU pick: cuda:{best} ({free / 1e9:.1f} GB free) "
          f"of {[(i, round(f / 1e9, 1)) for f, i in stats]}")
    return best


def _device() -> str:
    import torch
    if not torch.cuda.is_available():
        return "cpu"
    if "device" not in _state:
        _state["device"] = f"cuda:{pick_gpu()}"
    return _state["device"]


def _get_dino():
    with _lock:
        if "dino" not in _state:
            from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor
            proc = AutoProcessor.from_pretrained(DINO_MODEL_ID)
            model = AutoModelForZeroShotObjectDetection.from_pretrained(DINO_MODEL_ID)
            model.to(_device()).eval()
            _state["dino"] = (proc, model)
        return _state["dino"]


def _get_sam2_image():
    with _lock:
        if "sam2_image" not in _state:
            from transformers import Sam2Model, Sam2Processor
            proc = Sam2Processor.from_pretrained(SAM2_MODEL_ID)
            model = Sam2Model.from_pretrained(SAM2_MODEL_ID)
            model.to(_device()).eval()
            _state["sam2_image"] = (proc, model)
        return _state["sam2_image"]


def _get_sam2_video():
    with _lock:
        if "sam2_video" not in _state:
            from transformers import Sam2VideoModel, Sam2VideoProcessor
            proc = Sam2VideoProcessor.from_pretrained(SAM2_MODEL_ID)
            model = Sam2VideoModel.from_pretrained(SAM2_MODEL_ID)
            model.to(_device()).eval()
            _state["sam2_video"] = (proc, model)
        return _state["sam2_video"]


def normalize_dino_prompt(text: str) -> str:
    """Grounding DINO expects lowercase noun phrases terminated by periods."""
    t = text.strip().lower()
    for prefix in ("all ", "every ", "the "):
        if t.startswith(prefix):
            t = t[len(prefix):]
    if not t.endswith("."):
        t += "."
    return t


def dino_detect(frame_bgr: np.ndarray, prompt: str, threshold: float):
    """Returns (xyxy ndarray, scores ndarray, labels list) in pixel coords."""
    import torch
    from PIL import Image
    with _lock:
        proc, model = _get_dino()
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb)
        text = normalize_dino_prompt(prompt)
        inputs = proc(images=img, text=text, return_tensors="pt").to(_device())
        with torch.no_grad():
            out = model(**inputs)
        h, w = frame_bgr.shape[:2]
        res = proc.post_process_grounded_object_detection(
            out, inputs["input_ids"], threshold=threshold,
            text_threshold=0.25, target_sizes=[(h, w)])[0]
        boxes = res["boxes"].cpu().numpy()
        scores = res["scores"].cpu().numpy()
        labels = res.get("text_labels", res.get("labels", []))
        labels = [str(x) for x in labels]
        return boxes, scores, labels


def _prompt_args(prompt: dict, w: int, h: int):
    """Convert a normalized UI prompt into SAM2 processor kwargs (pixel coords)."""
    kwargs = {}
    if prompt.get("type") == "box":
        x, y, bw, bh = prompt["box"]
        kwargs["input_boxes"] = [[[x * w, y * h, (x + bw) * w, (y + bh) * h]]]
    elif prompt.get("type") == "click":
        pts = [[p["x"] * w, p["y"] * h] for p in prompt["points"]]
        labels = [1 if p.get("positive", True) else 0 for p in prompt["points"]]
        kwargs["input_points"] = [[pts]]
        kwargs["input_labels"] = [[labels]]
    else:
        raise ValueError(f"unsupported sam2 prompt {prompt.get('type')}")
    return kwargs


def sam2_image_mask(frame_bgr: np.ndarray, prompt: dict) -> tuple[np.ndarray, float]:
    """Single-image segmentation. Returns (binary u8 mask, score)."""
    import torch
    with _lock:
        proc, model = _get_sam2_image()
        h, w = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        inputs = proc(images=rgb, **_prompt_args(prompt, w, h),
                      return_tensors="pt").to(_device())
        with torch.no_grad():
            out = model(**inputs, multimask_output=False)
        masks = proc.post_process_masks(out.pred_masks.cpu(),
                                        inputs["original_sizes"])[0]
        mask = masks[0, 0].numpy()
        score = float(out.iou_scores.flatten()[0].item())
        return ((mask > 0.0).astype(np.uint8) * 255), score


def sam2_video_masks(frames_bgr: list[np.ndarray], prompts: list[dict]):
    """Propagate one or more prompted objects through a video.

    prompts: list of normalized prompt dicts (click/box), all anchored at frame 0.
    Yields (frame_idx, union_mask_u8, mean_score).
    """
    import torch
    with _lock:
        proc, model = _get_sam2_video()
        h, w = frames_bgr[0].shape[:2]
        rgb_frames = [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in frames_bgr]
        # keep video preprocessing, storage, and inference state in system RAM —
        # only per-frame features go to the GPU. Without processing_device="cpu"
        # SAM2 materializes the ENTIRE resized clip on the GPU (~10 GB for 800
        # frames) before storing it, OOMing long clips.
        session = proc.init_video_session(
            video=rgb_frames, inference_device=_device(),
            processing_device="cpu", video_storage_device="cpu",
            inference_state_device="cpu")
        for i, prompt in enumerate(prompts):
            proc.add_inputs_to_inference_session(
                inference_session=session, frame_idx=0, obj_ids=i + 1,
                **_prompt_args(prompt, w, h))

        def to_union(pred_masks):
            masks = proc.post_process_masks(
                [pred_masks], original_sizes=[[h, w]], binarize=True)[0]
            arr = masks.cpu().numpy()
            return (arr.reshape(-1, h, w).max(axis=0) > 0).astype(np.uint8) * 255

        try:
            with torch.no_grad():
                # anchor: run inference on the prompted frame before propagation
                first = model(inference_session=session, frame_idx=0)
                yield 0, to_union(first.pred_masks), 1.0
                for out in model.propagate_in_video_iterator(session):
                    if out.frame_idx == 0:
                        continue
                    yield out.frame_idx, to_union(out.pred_masks), 1.0
        finally:
            del session
            torch.cuda.empty_cache()
