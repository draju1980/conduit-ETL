"""CSV destination writer."""

from __future__ import annotations

import logging
from pathlib import Path

import pyarrow as pa
import pyarrow.csv as pcsv

from conduit.models import DestinationConfig

logger = logging.getLogger(__name__)


def load_csv(table: pa.Table, dest: DestinationConfig, base_dir: Path) -> None:
    """Write an Arrow table to a CSV file."""
    file_path = base_dir / dest.config.get("path", f"{dest.name}.csv")
    file_path.parent.mkdir(parents=True, exist_ok=True)

    write_options = pcsv.WriteOptions()
    delimiter = dest.config.get("delimiter", ",")
    if delimiter:
        write_options.delimiter = delimiter

    include_header = dest.config.get("include_header", True)
    write_options.include_header = include_header

    pcsv.write_csv(table, str(file_path), write_options=write_options)
    logger.info("Loaded %d rows to CSV destination '%s' (%s)", len(table), dest.name, file_path)
