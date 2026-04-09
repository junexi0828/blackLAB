from __future__ import annotations

from pathlib import Path

import yaml

from blacklab_factory.models import CompanyConfig


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_company_config(path: Path | None = None) -> CompanyConfig:
    config_path = path or repo_root() / "config" / "company.yaml"
    data = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    return CompanyConfig.model_validate(data)

