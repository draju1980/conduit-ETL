"""Parse pipeline.yaml into typed Pydantic models."""

from __future__ import annotations

from pathlib import Path

import yaml

from conduit.models import PipelineConfig


def load_pipeline(path: str | Path) -> PipelineConfig:
    """Load and validate a pipeline configuration file."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Pipeline config not found: {path}")

    with open(path) as f:
        raw = yaml.safe_load(f)

    if not isinstance(raw, dict):
        raise ValueError(f"Invalid pipeline config: expected a YAML mapping, got {type(raw).__name__}")

    return PipelineConfig.model_validate(raw)
