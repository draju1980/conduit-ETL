"""Tests for pipeline config parsing."""

from __future__ import annotations

from pathlib import Path

import pytest

from conduit.config import load_pipeline

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def test_load_valid_pipeline():
    config = load_pipeline(FIXTURES_DIR / "sample_pipeline.yaml")
    assert config.pipeline.name == "test_orders"
    assert len(config.sources) == 2
    assert config.sources[0].name == "orders"
    assert config.sources[0].type == "csv"
    assert config.transform.sql.strip().startswith("SELECT")
    assert len(config.validation) == 4
    assert len(config.destinations) == 1


def test_validation_checks_parsed():
    config = load_pipeline(FIXTURES_DIR / "sample_pipeline.yaml")
    checks = config.validation

    assert checks[0].type == "schema"
    assert checks[0].on_failure == "fail"
    assert len(checks[0].columns) == 5

    assert checks[1].type == "null_check"
    assert checks[1].on_failure == "fail"

    assert checks[2].type == "row_count"
    assert checks[2].on_failure == "warn"
    assert checks[2].min == 1
    assert checks[2].max == 10000000

    assert checks[3].type == "custom"
    assert checks[3].on_failure == "fail"
    assert "__result__" in checks[3].sql


def test_load_missing_file():
    with pytest.raises(FileNotFoundError):
        load_pipeline("/nonexistent/pipeline.yaml")
