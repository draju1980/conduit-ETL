"""Tests for DuckDB transform engine."""

from __future__ import annotations

import pyarrow as pa
import pytest

from conduit.engine.transform import run_transform


def test_simple_select():
    table = pa.table({"id": [1, 2, 3], "value": [10, 20, 30]})
    result = run_transform("SELECT * FROM data", {"data": table})
    assert len(result) == 3
    assert result.column_names == ["id", "value"]


def test_join_two_sources():
    orders = pa.table({
        "order_id": [1, 2, 3],
        "region_id": [1, 2, 1],
        "amount": [100.0, 200.0, 300.0],
    })
    regions = pa.table({
        "id": [1, 2],
        "region": ["North", "South"],
    })
    sql = """
        SELECT o.order_id, o.amount, r.region
        FROM orders o
        JOIN regions r ON o.region_id = r.id
    """
    result = run_transform(sql, {"orders": orders, "regions": regions})
    assert len(result) == 3
    assert "region" in result.column_names


def test_filter():
    table = pa.table({"status": ["active", "pending", "active"], "value": [1, 2, 3]})
    result = run_transform("SELECT * FROM t WHERE status = 'active'", {"t": table})
    assert len(result) == 2


def test_invalid_sql():
    table = pa.table({"id": [1]})
    with pytest.raises(Exception):
        run_transform("SELECT nonexistent FROM t", {"t": table})
