"""JSON / JSONL destination writer."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import pyarrow as pa

from conduit.models import DestinationConfig

logger = logging.getLogger(__name__)


def load_json(table: pa.Table, dest: DestinationConfig, base_dir: Path) -> None:
    """Write an Arrow table to a JSON or JSONL file."""
    file_path = base_dir / dest.config.get("path", f"{dest.name}.json")
    file_path.parent.mkdir(parents=True, exist_ok=True)

    orient = dest.config.get("orient", "records")
    jsonl = dest.config.get("jsonl", False) or dest.type == "jsonl"

    rows = table.to_pylist()

    with open(file_path, "w", encoding="utf-8") as f:
        if jsonl:
            for row in rows:
                f.write(json.dumps(row, default=str) + "\n")
        elif orient == "records":
            json.dump(rows, f, indent=2, default=str)
        else:
            json.dump(rows, f, indent=2, default=str)

    logger.info(
        "Loaded %d rows to %s destination '%s' (%s)",
        len(table), "JSONL" if jsonl else "JSON", dest.name, file_path,
    )
