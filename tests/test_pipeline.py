"""Integration tests for the full pipeline flow."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
import yaml

from conduit.pipeline import run_pipeline

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def pipeline_dir(tmp_path: Path) -> Path:
    """Copy fixture files to a temp directory for isolated testing."""
    for f in FIXTURES_DIR.iterdir():
        shutil.copy(f, tmp_path / f.name)
    return tmp_path


def test_pipeline_success(pipeline_dir: Path):
    """Pipeline with passing validation should produce output CSV."""
    config_path = pipeline_dir / "sample_pipeline.yaml"
    success = run_pipeline(str(config_path))
    assert success is True

    output = pipeline_dir / "output" / "test_output.csv"
    assert output.exists()
    content = output.read_text()
    assert "order_id" in content  # header present
    lines = content.strip().split("\n")
    assert len(lines) > 1  # header + data rows


def test_pipeline_validation_blocks_load(pipeline_dir: Path):
    """Pipeline with failing validation should NOT produce output."""
    config_path = pipeline_dir / "sample_pipeline.yaml"

    # Modify pipeline to have an impossible row count check (on_failure: fail)
    with open(config_path) as f:
        config = yaml.safe_load(f)

    config["validation"] = [
        {"type": "row_count", "min": 1000000, "max": 2000000, "on_failure": "fail"},
    ]
    with open(config_path, "w") as f:
        yaml.dump(config, f)

    success = run_pipeline(str(config_path))
    assert success is False

    output = pipeline_dir / "output" / "test_output.csv"
    assert not output.exists()


def test_pipeline_validation_warn_continues(pipeline_dir: Path):
    """Pipeline with warn-only validation should still load."""
    config_path = pipeline_dir / "sample_pipeline.yaml"

    with open(config_path) as f:
        config = yaml.safe_load(f)

    config["validation"] = [
        {"type": "row_count", "min": 1000000, "max": 2000000, "on_failure": "warn"},
    ]
    with open(config_path, "w") as f:
        yaml.dump(config, f)

    success = run_pipeline(str(config_path))
    assert success is True

    output = pipeline_dir / "output" / "test_output.csv"
    assert output.exists()


def test_pipeline_saves_validation_report(pipeline_dir: Path):
    """Validation report should be saved to .conduit/reports/."""
    config_path = pipeline_dir / "sample_pipeline.yaml"
    run_pipeline(str(config_path))

    reports_dir = pipeline_dir / ".conduit" / "reports"
    assert reports_dir.exists()
    reports = list(reports_dir.glob("*.json"))
    assert len(reports) == 1
    assert "test_orders" in reports[0].name


def test_validate_only_mode(pipeline_dir: Path):
    """validate_only=True should not produce output CSV."""
    config_path = pipeline_dir / "sample_pipeline.yaml"
    success = run_pipeline(str(config_path), validate_only=True)
    assert success is True

    output = pipeline_dir / "output" / "test_output.csv"
    assert not output.exists()
