import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import DB_PATH

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
Base = declarative_base()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class JSONMixin:
    """JSON columns stored as TEXT for SQLite portability."""

    @staticmethod
    def loads(value, default):
        if not value:
            return default
        return json.loads(value)


class Project(Base, JSONMixin):
    __tablename__ = "projects"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, default="Untitled Machine Industries Project")
    version = Column(String, default="0.2")
    owner_id = Column(String, nullable=True)  # auth comes in beta hardening
    render_layers = Column(Text, default="[]")
    timeline = Column(Text, default="{}")
    settings = Column(Text, default="{}")
    created_at = Column(String, default=now_iso)
    updated_at = Column(String, default=now_iso)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "version": self.version,
            "renderLayers": self.loads(self.render_layers, []),
            "timeline": self.loads(self.timeline, {}),
            "settings": self.loads(self.settings, {}),
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


class Asset(Base, JSONMixin):
    __tablename__ = "assets"
    id = Column(String, primary_key=True)
    project_id = Column(String, nullable=False, index=True)
    type = Column(String, nullable=False)  # image | video
    name = Column(String, nullable=False)
    status = Column(String, default="ingesting")  # ingesting | ready | failed
    width = Column(Integer)
    height = Column(Integer)
    fps = Column(Float)
    duration = Column(Float)
    frame_count = Column(Integer)
    source_key = Column(String)
    proxy_key = Column(String)
    proxy_mime = Column(String)
    proxy_width = Column(Integer)
    proxy_height = Column(Integer)
    thumb_key = Column(String)
    error = Column(Text)
    created_at = Column(String, default=now_iso)

    def to_dict(self):
        return {
            "id": self.id,
            "projectId": self.project_id,
            "type": self.type,
            "name": self.name,
            "status": self.status,
            "width": self.width,
            "height": self.height,
            "fps": self.fps,
            "duration": self.duration,
            "frameCount": self.frame_count,
            "sourceUrl": f"/storage/{self.source_key}" if self.source_key else None,
            "proxyUrl": f"/storage/{self.proxy_key}" if self.proxy_key else None,
            "proxyMime": self.proxy_mime,
            "proxyWidth": self.proxy_width,
            "proxyHeight": self.proxy_height,
            "thumbnailUrl": f"/storage/{self.thumb_key}" if self.thumb_key else None,
            "error": self.error,
            "createdAt": self.created_at,
        }


class VisionPass(Base, JSONMixin):
    __tablename__ = "vision_passes"
    id = Column(String, primary_key=True)
    project_id = Column(String, nullable=False, index=True)
    asset_id = Column(String, nullable=False, index=True)
    type = Column(String, nullable=False)
    name = Column(String, nullable=False)
    provider = Column(String)
    provider_version = Column(String)
    status = Column(String, default="pending")  # pending | running | ready | failed
    frame_start = Column(Integer, default=0)
    frame_end = Column(Integer, default=0)
    prompt = Column(Text, default="{}")
    params = Column(Text, default="{}")
    data_key = Column(String)  # storage key of data.json
    summary = Column(Text, default="{}")
    cache_key = Column(String, index=True)
    error = Column(Text)
    created_at = Column(String, default=now_iso)

    def to_dict(self):
        return {
            "id": self.id,
            "projectId": self.project_id,
            "assetId": self.asset_id,
            "type": self.type,
            "name": self.name,
            "provider": self.provider,
            "providerVersion": self.provider_version,
            "status": self.status,
            "frameStart": self.frame_start,
            "frameEnd": self.frame_end,
            "prompt": self.loads(self.prompt, {}),
            "params": self.loads(self.params, {}),
            "dataUrl": f"/storage/{self.data_key}" if self.data_key else None,
            "summary": self.loads(self.summary, {}),
            "error": self.error,
            "createdAt": self.created_at,
        }


class Job(Base, JSONMixin):
    __tablename__ = "jobs"
    id = Column(String, primary_key=True)
    type = Column(String, nullable=False)
    status = Column(String, default="queued")
    progress = Column(Float, default=0.0)
    stage = Column(String, default="")
    project_id = Column(String, index=True)
    asset_id = Column(String)
    params = Column(Text, default="{}")
    result = Column(Text)
    error = Column(Text)
    created_at = Column(String, default=now_iso)
    updated_at = Column(String, default=now_iso)

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "status": self.status,
            "progress": self.progress,
            "stage": self.stage,
            "projectId": self.project_id,
            "assetId": self.asset_id,
            "params": self.loads(self.params, {}),
            "result": self.loads(self.result, None),
            "error": self.error,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


class ExportRecord(Base, JSONMixin):
    __tablename__ = "exports"
    id = Column(String, primary_key=True)
    project_id = Column(String, index=True)
    asset_id = Column(String)
    type = Column(String, nullable=False)
    format = Column(String)
    status = Column(String, default="queued")
    output_key = Column(String)
    manifest = Column(Text, default="{}")
    error = Column(Text)
    created_at = Column(String, default=now_iso)

    def to_dict(self):
        return {
            "id": self.id,
            "projectId": self.project_id,
            "assetId": self.asset_id,
            "type": self.type,
            "format": self.format,
            "status": self.status,
            "outputUrl": f"/storage/{self.output_key}" if self.output_key else None,
            "manifest": self.loads(self.manifest, {}),
            "error": self.error,
            "createdAt": self.created_at,
        }


class Preset(Base, JSONMixin):
    __tablename__ = "presets"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    category = Column(String, default="composite")
    required_pass_types = Column(Text, default="[]")
    render_layers = Column(Text, default="[]")
    builtin = Column(Integer, default=0)
    created_at = Column(String, default=now_iso)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "requiredPassTypes": self.loads(self.required_pass_types, []),
            "renderLayers": self.loads(self.render_layers, []),
            "builtin": bool(self.builtin),
            "createdAt": self.created_at,
        }


def init_db():
    Base.metadata.create_all(engine)
