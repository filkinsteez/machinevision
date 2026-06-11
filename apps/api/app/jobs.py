"""In-process job runner. Same job table contract the Celery workers will use.

Jobs are cooperative-cancellable: handlers check ctx.cancelled between frames/chunks.
"""
import json
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor

from .db import Job, SessionLocal, new_id, now_iso

_executor = ThreadPoolExecutor(max_workers=2)
_handlers: dict[str, callable] = {}
_cancel_flags: dict[str, threading.Event] = {}


def handler(job_type: str):
    def deco(fn):
        _handlers[job_type] = fn
        return fn
    return deco


class JobContext:
    def __init__(self, job_id: str, params: dict):
        self.job_id = job_id
        self.params = params

    @property
    def cancelled(self) -> bool:
        ev = _cancel_flags.get(self.job_id)
        return ev.is_set() if ev else False

    def update(self, progress: float, stage: str = ""):
        with SessionLocal() as db:
            job = db.get(Job, self.job_id)
            if job and job.status == "running":
                job.progress = round(float(progress), 4)
                if stage:
                    job.stage = stage
                job.updated_at = now_iso()
                db.commit()


def _set_status(job_id: str, **fields):
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if not job:
            return
        for k, v in fields.items():
            setattr(job, k, v)
        job.updated_at = now_iso()
        db.commit()


def _run(job_id: str, job_type: str, params: dict):
    if _cancel_flags.get(job_id, threading.Event()).is_set():
        _set_status(job_id, status="cancelled")
        return
    _set_status(job_id, status="running", stage="starting")
    ctx = JobContext(job_id, params)
    try:
        result = _handlers[job_type](ctx)
        if ctx.cancelled:
            _set_status(job_id, status="cancelled")
        else:
            _set_status(job_id, status="ready", progress=1.0, stage="done",
                        result=json.dumps(result) if result is not None else None)
    except Exception as exc:
        traceback.print_exc()
        _set_status(job_id, status="failed", error=f"{type(exc).__name__}: {exc}")
    finally:
        _cancel_flags.pop(job_id, None)


def submit(job_type: str, params: dict, project_id: str | None = None,
           asset_id: str | None = None) -> dict:
    if job_type not in _handlers:
        raise ValueError(f"unknown job type {job_type}")
    job_id = new_id("job")
    with SessionLocal() as db:
        job = Job(id=job_id, type=job_type, status="queued",
                  project_id=project_id, asset_id=asset_id,
                  params=json.dumps(params))
        db.add(job)
        db.commit()
        snapshot = job.to_dict()
    _cancel_flags[job_id] = threading.Event()
    _executor.submit(_run, job_id, job_type, params)
    return snapshot


def cancel(job_id: str) -> bool:
    ev = _cancel_flags.get(job_id)
    if ev:
        ev.set()
        return True
    return False
