"""Confirm seg + depth + normal with raw-RGB preprocessing (norm is baked into the
torchscript export). Render all three on a full frame."""
import sys
from pathlib import Path

import cv2
import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from huggingface_hub import hf_hub_download, list_repo_files  # noqa: E402

OUT = Path(__file__).resolve().parents[3] / "test-assets"
device = "cuda"
H, W = 1024, 768


def load(repo):
    files = list_repo_files(repo)
    ckpt = sorted(f for f in files if f.endswith((".pt2", ".pt")))[0]
    return torch.jit.load(hf_hub_download(repo_id=repo, filename=ckpt)).eval().to(device)


def pre(img):  # raw RGB 0-255, CHW
    rgb = cv2.cvtColor(cv2.resize(img, (W, H)), cv2.COLOR_BGR2RGB).astype(np.float32)
    return torch.from_numpy(rgb.transpose(2, 0, 1)[None]).to(device)


proxies = list((Path(__file__).resolve().parents[3] / "data" / "storage" / "proxies").glob("*/proxy.*"))
cap = cv2.VideoCapture(str(proxies[0]))
cap.set(cv2.CAP_PROP_POS_FRAMES, 120)
ok, img = cap.read()
cap.release()
oh, ow = img.shape[:2]


def up(arr):
    return cv2.resize(arr, (ow, oh), interpolation=cv2.INTER_NEAREST if arr.dtype == np.uint8 else cv2.INTER_LINEAR)


# seg
seg = load("facebook/sapiens-seg-0.3b-torchscript")
with torch.no_grad():
    ids = seg(pre(img)).argmax(1)[0].cpu().numpy().astype(np.uint8)
print("seg classes:", sorted(np.unique(ids).tolist()))
rng = np.random.default_rng(7)
pal = rng.integers(50, 255, (256, 3), dtype=np.uint8); pal[0] = 0
seg_vis = (img * 0.35 + up(ids)[..., None].astype(np.float32) * 0 + pal[up(ids)][..., ::-1] * 0.65).astype(np.uint8)

# depth (mask to person via seg so background doesn't dominate the range)
depth = load("facebook/sapiens-depth-0.3b-torchscript")
with torch.no_grad():
    d = depth(pre(img))[0, 0].cpu().numpy()
d = up(d)
person = up(ids) > 0
dv = d.copy()
if person.any():
    lo, hi = np.percentile(d[person], [2, 98])
    dv = np.clip((d - lo) / (hi - lo + 1e-6), 0, 1)
depth_vis = cv2.applyColorMap(((1 - dv) * 255).astype(np.uint8), cv2.COLORMAP_INFERNO)
depth_vis[~person] = (img[~person] * 0.3).astype(np.uint8)

# normal
normal = load("facebook/sapiens-normal-0.3b-torchscript")
with torch.no_grad():
    n = normal(pre(img))[0].cpu().numpy()  # (3,h,w)
n = np.stack([up(n[i]) for i in range(3)], -1)
n = n / (np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6)
normal_vis = (((n * 0.5 + 0.5) * 255).astype(np.uint8))[..., ::-1].copy()
normal_vis[~person] = (img[~person] * 0.3).astype(np.uint8)

cv2.imwrite(str(OUT / "spike_sapiens_all.png"),
            np.hstack([img, seg_vis, depth_vis, normal_vis]))
print("wrote spike_sapiens_all.png (orig | seg | depth | normal)")
