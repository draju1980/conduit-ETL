"""Shared test fixtures."""

from __future__ import annotations

from pathlib import Path

import pyarrow as pa
import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES_DIR


@pytest.fixture
def sample_table() -> pa.Table:
    """A simple Arrow table for validation tests."""
    return pa.table({
        "order_id": pa.array([1, 2, 3, 4, 5], type=pa.int64()),
        "customer_id": pa.array([101, 102, 103, 101, 104], type=pa.int64()),
        "amount": pa.array([250.0, 175.5, 500.0, 89.99, 1200.0], type=pa.float64()),
        "status": pa.array(["active", "active", "completed", "active", "active"]),
        "region": pa.array(["NA", "EU", "NA", "APAC", "EU"]),
    })


@pytest.fixture
def table_with_nulls() -> pa.Table:
    """Arrow table with null values for null_check tests."""
    return pa.table({
        "order_id": pa.array([1, 2, None, 4, 5], type=pa.int64()),
        "customer_id": pa.array([101, None, 103, 101, 104], type=pa.int64()),
        "amount": pa.array([250.0, 175.5, 500.0, 89.99, 1200.0], type=pa.float64()),
    })


@pytest.fixture
def table_with_negatives() -> pa.Table:
    """Arrow table with negative amounts for custom SQL tests."""
    return pa.table({
        "order_id": pa.array([1, 2, 3], type=pa.int64()),
        "amount": pa.array([250.0, -50.0, 100.0], type=pa.float64()),
    })


@pytest.fixture
def tmp_output_dir(tmp_path: Path) -> Path:
    return tmp_path / "output"
