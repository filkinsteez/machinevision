from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import STORAGE_DIR
from .db import init_db
from .presets_seed import seed_presets
from .routes import router

# importing registers the job handlers
from . import media_jobs, export  # noqa: F401
from .vision import jobs as vision_jobs  # noqa: F401
from .render import datamosh  # noqa: F401

init_db()
seed_presets()

app = FastAPI(title="Machine Vision API", version="0.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.mount("/storage", StaticFiles(directory=str(STORAGE_DIR)), name="storage")


@app.get("/health")
def health():
    return {"ok": True}
