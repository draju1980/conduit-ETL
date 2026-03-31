"""Snowflake destination writer."""

from __future__ import annotations

import logging
from pathlib import Path

import pyarrow as pa

from conduit.models import DestinationConfig

logger = logging.getLogger(__name__)


def load_snowflake(table: pa.Table, dest: DestinationConfig, base_dir: Path) -> None:
    """Write an Arrow table to a Snowflake table."""
    try:
        import snowflake.connector
        from snowflake.connector.pandas_tools import write_pandas
    except ImportError:
        raise ImportError(
            "snowflake-connector-python[pandas] is required for Snowflake destinations. "
            "Install it with: pip install snowflake-connector-python[pandas]"
        )

    conn_params = {
        "account": dest.config.get("account"),
        "user": dest.config.get("user"),
        "password": dest.config.get("password"),
        "warehouse": dest.config.get("warehouse"),
        "database": dest.config.get("database"),
        "schema": dest.config.get("schema", "PUBLIC"),
        "role": dest.config.get("role"),
    }
    conn_params = {k: v for k, v in conn_params.items() if v is not None}

    target_table = dest.config.get("table", dest.name).upper()

    conn = snowflake.connector.connect(**conn_params)
    try:
        cur = conn.cursor()

        if dest.mode == "full_refresh":
            cur.execute(f"DROP TABLE IF EXISTS {target_table}")

        # Convert Arrow → pandas → Snowflake via write_pandas
        df = table.to_pandas()
        write_pandas(
            conn,
            df,
            table_name=target_table,
            auto_create_table=True,
            chunk_size=dest.batch_size,
        )
        logger.info(
            "Loaded %d rows to Snowflake destination '%s' (%s)",
            len(table), dest.name, target_table,
        )
    finally:
        conn.close()
