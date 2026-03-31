"""Parquet destination writer."""

from __future__ import annotations

import logging
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from conduit.models import DestinationConfig

logger = logging.getLogger(__name__)


def load_parquet(table: pa.Table, dest: DestinationConfig, base_dir: Path) -> None:
    """Write an Arrow table to a Parquet file."""
    file_path = base_dir / dest.config.get("path", f"{dest.name}.parquet")
    file_path.parent.mkdir(parents=True, exist_ok=True)

    compression = dest.config.get("compression", "snappy")
    row_group_size = dest.config.get("row_group_size", dest.batch_size)

    pq.write_table(
        table,
        str(file_path),
        compression=compression,
        row_group_size=row_group_size,
    )
    logger.info(
        "Loaded %d rows to Parquet destination '%s' (%s)",
        len(table), dest.name, file_path,
    )
