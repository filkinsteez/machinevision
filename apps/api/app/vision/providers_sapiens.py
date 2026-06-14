"""Meta Sapiens providers: human-centric foundation models (body-part
segmentation, depth, surface normals) as torchscript from HuggingFace.

The torchscript exports have ImageNet normalization BAKED IN — feed raw RGB
0-255 resized to 768x1024 (W x H). Loaded lazily, GPU-serialized behind one
lock, used only when CUDA is available.
"""
import threading

import cv2
import numpy as np

REPOS = {
    "body_parts": "facebook/sapiens-seg-0.3b-torchscript",
    "depth": "facebook/sapiens-depth-0.3b-torchscript",
    "normals": "facebook/sapiens-normal-0.3b-torchscript",
}

# Goliath 28-class body-part labels (Sapiens segmentation)
GOLIATH_CLASSES = [
    "Background", "Apparel", "Face/Neck", "Hair", "Left Foot", "Left Hand",
    "Left Lower Arm", "Left Lower Leg", "Left Shoe", "Left Sock", "Left Upper Arm",
    "Left Upper Leg", "Lower Clothing", "Right Foot", "Right Hand", "Right Lower Arm",
    "Right Lower Leg", "Right Shoe", "Right Sock", "Right Upper Arm", "Right Upper Leg",
    "Torso", "Upper Clothing", "Lower Lip", "Upper Lip", "Lower Teeth", "Upper Teeth",
    "Tongue",
]

INPUT_H, INPUT_W = 1024, 768
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


def version(task: str) -> str:
    return f"{REPOS[task]} (sapiens-0.3b torchscript)"


def _device() -> str:
    import torch
    return "cuda" if torch.cuda.is_available() else "cpu"


def _get_model(task: str):
    with _lock:
        key = f"model_{task}"
        if key not in _state:
            import torch
            from huggingface_hub import hf_hub_download, list_repo_files
            repo = REPOS[task]
            files = list_repo_files(repo)
            ckpt = sorted(f for f in files if f.endswith((".pt2", ".pt")))[0]
            path = hf_hub_download(repo_id=repo, filename=ckpt)
            _state[key] = torch.jit.load(path).eval().to(_device())
        return _state[key]


def _preprocess(frame_bgr: np.ndarray):
    import torch
    rgb = cv2.cvtColor(cv2.resize(frame_bgr, (INPUT_W, INPUT_H)), cv2.COLOR_BGR2RGB)
    ten = torch.from_numpy(rgb.astype(np.float32).transpose(2, 0, 1))[None]
    return ten.to(_device())


def infer_body_parts(frame_bgr: np.ndarray) -> np.ndarray:
    """Returns a uint8 class-id map (0-27) at the model's native 512x384."""
    import torch
    with _lock:
        model = _get_model("body_parts")
        with torch.no_grad():
            out = model(_preprocess(frame_bgr))
        return out.argmax(1)[0].to(torch.uint8).cpu().numpy()


def infer_depth(frame_bgr: np.ndarray) -> np.ndarray:
    """Returns a float32 depth map (near = small). Native model resolution."""
    import torch
    with _lock:
        model = _get_model("depth")
        with torch.no_grad():
            out = model(_preprocess(frame_bgr))
        return out[0, 0].float().cpu().numpy()


def infer_normals(frame_bgr: np.ndarray) -> np.ndarray:
    """Returns a float32 HxWx3 unit surface-normal map."""
    import torch
    with _lock:
        model = _get_model("normals")
        with torch.no_grad():
            out = model(_preprocess(frame_bgr))
        n = out[0].float().cpu().numpy().transpose(1, 2, 0)
        return n / (np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6)
