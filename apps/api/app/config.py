"""Local-dev configuration.

Local dev mode deviations from the production architecture (IMPLEMENTATION_PLAN AD-4/AD-11):
SQLite instead of Postgres, local-disk storage instead of S3/MinIO, in-process thread
pool instead of Celery. All three sit behind the same interfaces the production
versions will implement.
"""
import os
from pathlib import Path

# reduce CUDA fragmentation OOMs on long clips (must be set before torch loads)
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "data"
STORAGE_DIR = DATA_DIR / "storage"
DB_PATH = DATA_DIR / "machinevision.db"

PROXY_MAX_HEIGHT = 540
THUMB_HEIGHT = 180
MAX_VIDEO_SECONDS = 60
MAX_UPLOAD_BYTES = 800 * 1024 * 1024

SCHEMA_VERSION = 1

for d in (DATA_DIR, STORAGE_DIR):
    d.mkdir(parents=True, exist_ok=True)
