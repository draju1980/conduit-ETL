"""PostgreSQL destination writer."""

from __future__ import annotations

import logging
from pathlib import Path

import pyarrow as pa

from conduit.models import DestinationConfig

logger = logging.getLogger(__name__)


def load_postgres(table: pa.Table, dest: DestinationConfig, base_dir: Path) -> None:
    """Write an Arrow table to a PostgreSQL table."""
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        raise ImportError(
            "psycopg2 is required for PostgreSQL destinations. "
            "Please ensure you are using the official Conduit ETL binary which bundles all drivers."
        )

    conn_params = {
        "host": dest.config.get("host", "localhost"),
        "port": dest.config.get("port", 5432),
        "dbname": dest.config.get("database", dest.config.get("dbname")),
        "user": dest.config.get("user"),
        "password": dest.config.get("password"),
    }
    # Remove None values so psycopg2 uses defaults / env vars
    conn_params = {k: v for k, v in conn_params.items() if v is not None}

    target_table = dest.config.get("table", dest.name)
    schema = dest.config.get("schema", "public")
    qualified_table = f"{schema}.{target_table}"

    conn = psycopg2.connect(**conn_params)
    try:
        cur = conn.cursor()

        if dest.mode == "full_refresh":
            cur.execute(f"DROP TABLE IF EXISTS {qualified_table}")
            _create_table(cur, table, qualified_table)

        _insert_rows(cur, table, qualified_table, dest.batch_size)
        conn.commit()
        logger.info(
            "Loaded %d rows to PostgreSQL destination '%s' (%s)",
            len(table), dest.name, qualified_table,
        )
    finally:
        conn.close()


def _create_table(cur, table: pa.Table, qualified_table: str) -> None:
    """Create a table from the Arrow schema."""
    col_defs = []
    for field in table.schema:
        pg_type = _arrow_to_pg_type(field.type)
        col_defs.append(f'"{field.name}" {pg_type}')
    ddl = f"CREATE TABLE {qualified_table} ({', '.join(col_defs)})"
    cur.execute(ddl)


def _arrow_to_pg_type(arrow_type: pa.DataType) -> str:
    """Map Arrow types to PostgreSQL types."""
    mapping = {
        pa.int8(): "SMALLINT",
        pa.int16(): "SMALLINT",
        pa.int32(): "INTEGER",
        pa.int64(): "BIGINT",
        pa.float32(): "REAL",
        pa.float64(): "DOUBLE PRECISION",
        pa.string(): "TEXT",
        pa.large_string(): "TEXT",
        pa.bool_(): "BOOLEAN",
        pa.date32(): "DATE",
        pa.date64(): "DATE",
    }
    if arrow_type in mapping:
        return mapping[arrow_type]
    if pa.types.is_timestamp(arrow_type):
        return "TIMESTAMP"
    if pa.types.is_decimal(arrow_type):
        return f"NUMERIC({arrow_type.precision},{arrow_type.scale})"
    return "TEXT"


def _insert_rows(cur, table: pa.Table, qualified_table: str, batch_size: int) -> None:
    """Insert rows using batch execute."""
    import psycopg2.extras

    columns = [f'"{name}"' for name in table.column_names]
    placeholders = ", ".join(["%s"] * len(columns))
    insert_sql = f"INSERT INTO {qualified_table} ({', '.join(columns)}) VALUES ({placeholders})"

    rows = table.to_pylist()
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        values = [tuple(row[col] for col in table.column_names) for row in batch]
        psycopg2.extras.execute_batch(cur, insert_sql, values)
