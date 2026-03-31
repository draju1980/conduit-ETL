"""MySQL destination writer."""

from __future__ import annotations

import logging
from pathlib import Path

import pyarrow as pa

from conduit.models import DestinationConfig

logger = logging.getLogger(__name__)


def load_mysql(table: pa.Table, dest: DestinationConfig, base_dir: Path) -> None:
    """Write an Arrow table to a MySQL table."""
    try:
        import pymysql
    except ImportError:
        raise ImportError(
            "pymysql is required for MySQL destinations. "
            "Install it with: pip install pymysql"
        )

    conn_params = {
        "host": dest.config.get("host", "localhost"),
        "port": dest.config.get("port", 3306),
        "database": dest.config.get("database"),
        "user": dest.config.get("user"),
        "password": dest.config.get("password"),
    }
    conn_params = {k: v for k, v in conn_params.items() if v is not None}

    target_table = dest.config.get("table", dest.name)

    conn = pymysql.connect(**conn_params)
    try:
        cur = conn.cursor()

        if dest.mode == "full_refresh":
            cur.execute(f"DROP TABLE IF EXISTS `{target_table}`")
            _create_table(cur, table, target_table)

        _insert_rows(cur, table, target_table, dest.batch_size)
        conn.commit()
        logger.info(
            "Loaded %d rows to MySQL destination '%s' (%s)",
            len(table), dest.name, target_table,
        )
    finally:
        conn.close()


def _create_table(cur, table: pa.Table, target_table: str) -> None:
    """Create a table from the Arrow schema."""
    col_defs = []
    for field in table.schema:
        mysql_type = _arrow_to_mysql_type(field.type)
        col_defs.append(f"`{field.name}` {mysql_type}")
    ddl = f"CREATE TABLE `{target_table}` ({', '.join(col_defs)})"
    cur.execute(ddl)


def _arrow_to_mysql_type(arrow_type: pa.DataType) -> str:
    """Map Arrow types to MySQL types."""
    mapping = {
        pa.int8(): "TINYINT",
        pa.int16(): "SMALLINT",
        pa.int32(): "INT",
        pa.int64(): "BIGINT",
        pa.float32(): "FLOAT",
        pa.float64(): "DOUBLE",
        pa.string(): "TEXT",
        pa.large_string(): "LONGTEXT",
        pa.bool_(): "BOOLEAN",
        pa.date32(): "DATE",
        pa.date64(): "DATE",
    }
    if arrow_type in mapping:
        return mapping[arrow_type]
    if pa.types.is_timestamp(arrow_type):
        return "DATETIME"
    if pa.types.is_decimal(arrow_type):
        return f"DECIMAL({arrow_type.precision},{arrow_type.scale})"
    return "TEXT"


def _insert_rows(cur, table: pa.Table, target_table: str, batch_size: int) -> None:
    """Insert rows in batches."""
    columns = [f"`{name}`" for name in table.column_names]
    placeholders = ", ".join(["%s"] * len(columns))
    insert_sql = f"INSERT INTO `{target_table}` ({', '.join(columns)}) VALUES ({placeholders})"

    rows = table.to_pylist()
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        values = [tuple(row[col] for col in table.column_names) for row in batch]
        cur.executemany(insert_sql, values)
