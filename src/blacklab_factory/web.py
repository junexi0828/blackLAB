from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI

from blacklab_factory.config import repo_root
from blacklab_factory.dashboard import create_app as create_dashboard_app
from blacklab_factory.storage import RunStorage


def create_app(storage_root: Path | None = None) -> FastAPI:
    storage = RunStorage(storage_root or (repo_root() / ".factory"))
    return create_dashboard_app(storage)
