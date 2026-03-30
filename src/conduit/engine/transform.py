"""Transform data using DuckDB SQL engine."""

from __future__ import annotations

import logging

import duckdb
import pyarrow as pa

logger = logging.getLogger(__name__)


def run_transform(sql: str, sources: dict[str, pa.Table]) -> pa.Table:
    """Register source tables in DuckDB and execute the transform SQL.

    Returns the result as an Arrow table.
    """
    conn = duckdb.connect(":memory:")

    for name, table in sources.items():
        conn.register(name, table)
        logger.debug("Registered source '%s' (%d rows, %d cols)", name, len(table), len(table.schema))

    logger.info("Running transform SQL (%d characters)", len(sql.strip()))
    result = conn.execute(sql).to_arrow_table()
    logger.info("Transform complete: %d rows, %d columns", len(result), len(result.schema))

    conn.close()
    return result
