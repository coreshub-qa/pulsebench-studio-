from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    app_name: str
    data_dir: Path
    runs_dir: Path
    batches_dir: Path
    builtin_datasets_dir: Path
    frontend_dist: Path
    ai_base_url: str | None
    ai_api_key: str | None
    ai_model: str | None
    allow_mock: bool


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def get_settings() -> Settings:
    backend_dir = Path(__file__).resolve().parent
    project_root = backend_dir.parent
    data_dir = Path(os.getenv("PULSEBENCH_DATA_DIR", str(project_root / "data"))).resolve()
    runs_dir = Path(os.getenv("PULSEBENCH_RUNS_DIR", str(data_dir / "runs"))).resolve()
    batches_dir = Path(os.getenv("PULSEBENCH_BATCHES_DIR", str(data_dir / "batches"))).resolve()
    builtin_datasets_dir = Path(
        os.getenv("PULSEBENCH_BUILTIN_DATASETS_DIR", str(backend_dir / "assets" / "datasets"))
    ).resolve()
    frontend_dist = Path(
        os.getenv("PULSEBENCH_FRONTEND_DIST", str(project_root / "frontend" / "dist"))
    ).resolve()

    return Settings(
        app_name="PulseBench Studio",
        data_dir=data_dir,
        runs_dir=runs_dir,
        batches_dir=batches_dir,
        builtin_datasets_dir=builtin_datasets_dir,
        frontend_dist=frontend_dist,
        ai_base_url=os.getenv("AI_BASE_URL"),
        ai_api_key=os.getenv("AI_API_KEY"),
        ai_model=os.getenv("AI_MODEL"),
        allow_mock=_bool_env("PULSEBENCH_ALLOW_MOCK", False),
    )
