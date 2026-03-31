"""MongoDB destination writer."""

from __future__ import annotations

import logging
from pathlib import Path

import pyarrow as pa

from conduit.models import DestinationConfig

logger = logging.getLogger(__name__)


def load_mongodb(table: pa.Table, dest: DestinationConfig, base_dir: Path) -> None:
    """Write an Arrow table to a MongoDB collection."""
    try:
        import pymongo
    except ImportError:
        raise ImportError(
            "pymongo is required for MongoDB destinations. "
            "Install it with: pip install pymongo"
        )

    uri = dest.config.get("uri", "mongodb://localhost:27017")
    database = dest.config.get("database")
    collection_name = dest.config.get("collection", dest.name)

    if not database:
        raise ValueError("MongoDB destination requires 'database' in config")

    client = pymongo.MongoClient(uri)
    try:
        db = client[database]
        collection = db[collection_name]

        if dest.mode == "full_refresh":
            collection.drop()

        rows = table.to_pylist()
        for i in range(0, len(rows), dest.batch_size):
            batch = rows[i : i + dest.batch_size]
            collection.insert_many(batch)

        logger.info(
            "Loaded %d rows to MongoDB destination '%s' (%s.%s)",
            len(table), dest.name, database, collection_name,
        )
    finally:
        client.close()
