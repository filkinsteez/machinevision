"""Local-disk object storage behind a thin interface (S3/MinIO swap point)."""
import shutil
from pathlib import Path

from .config import STORAGE_DIR


def path_for(key: str) -> Path:
    p = (STORAGE_DIR / key).resolve()
    if not str(p).startswith(str(STORAGE_DIR.resolve())):
        raise ValueError("invalid storage key")
    return p


def save_bytes(key: str, data: bytes) -> str:
    p = path_for(key)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return key


def open_for_write(key: str) -> Path:
    p = path_for(key)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def exists(key: str) -> bool:
    return path_for(key).exists()


def delete_prefix(prefix: str):
    p = path_for(prefix)
    if p.is_dir():
        shutil.rmtree(p, ignore_errors=True)
    elif p.exists():
        p.unlink(missing_ok=True)


def url_for(key: str) -> str:
    return f"/storage/{key}"
