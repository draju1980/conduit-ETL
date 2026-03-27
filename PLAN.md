# Conduit — Architecture & Design Plan

## Overview

Conduit is a local-first ELT (Extract, Transform, Load) workbench for data engineers. It provides a unified SDK and web interface to pull data from heterogeneous sources, transform it with SQL, and export to destination databases or files — all from a single tool.

---

## High-Level Data Flow

```
EXTRACT                 TRANSFORM                  LOAD
┌─────────────┐        ┌──────────────────┐       ┌──────────────────┐
│ Postgres     │        │                  │       │ Snowflake        │
│ CSV / Excel  │──────▶ │  DuckDB (SQL)    │─────▶ │ BigQuery         │
│ BigQuery     │ Arrow  │  Validation      │       │ CSV export       │
│ MongoDB      │        │                  │       │ S3               │
└─────────────┘        └──────────────────┘       └──────────────────┘
  Connector Layer         In-memory engine           Batch writer
  + Vault secrets         + Schema checks            + Incremental
```

---

## Step-by-Step Breakdown

### Step 1 — Extract

The user defines sources in `pipeline.yaml` or via the web UI. The connector layer pulls data from each source. Vault resolves encrypted credentials at this point — never before. Each source streams data in chunks, not all at once, keeping memory usage low.

### Step 2 — Normalize

Each connector converts its source data into **Apache Arrow** format. This gives DuckDB a consistent in-memory format regardless of the origin — whether it's a Postgres table, an Excel file, or a MongoDB collection. Schema is inferred at this stage.

### Step 3 — Transform

DuckDB registers all normalized sources as virtual tables. The user's SQL runs across all of them as if they were a single database. Full SQL is supported: JOINs, aggregations, CTEs, and window functions across sources.

```sql
SELECT o.*, r.region
FROM orders o
JOIN regions r ON o.region_id = r.id
WHERE o.status = 'active'
```

### Step 4 — Validate

Before writing to the destination, Conduit runs a validation pass:

| Check        | Description                             |
| ------------ | --------------------------------------- |
| Schema check | Output columns match destination schema |
| Null check   | Required fields are not empty           |
| Row count    | Catches silent empty result sets        |
| Dry run mode | Stops here and reports what would load  |

### Step 5 — Load

The connector writes to the destination in batches. Supports both full refresh and incremental modes. On failure, Conduit logs the exact batch, row, and error for debugging.

---

## Incremental Loads

Conduit tracks a **watermark** (last run timestamp or last ID) per pipeline. On subsequent runs, only new or updated rows are pulled — dramatically reducing load times and destination write costs for large datasets.

```bash
# First run — full load
conduit run pipeline.yaml
# Extracted 100,000 rows
# Loaded 100,000 rows -> snowflake.analytics.orders

# Second run — incremental
conduit run pipeline.yaml
# Extracted 523 new rows (since last run)
# Loaded 523 rows -> snowflake.analytics.orders
```

---

## Time Machine — Schema Locks & Config Versioning

Data pipelines break silently when upstream sources change schemas or when someone accidentally modifies a working pipeline config. Time Machine prevents this with two mechanisms:

### Schema Locks

On first run (or via `conduit lock`), Conduit snapshots the schema (column names, types, nullability) for each source and destination. On every subsequent run, the live schema is compared against the locked snapshot.

**Detected drifts:**
- Column added, removed, or renamed
- Type changed (e.g., `INTEGER` → `VARCHAR`)
- Nullability changed (`NOT NULL` ↔ `NULL`)

Each lock is independently configurable:
- `on_violation: block` — pipeline refuses to run until the lock is updated
- `on_violation: warn` — logs the drift and continues

```yaml
sources:
  - name: orders
    type: postgres
    connection: my-pg-conn
    config:
      schema: public
      table: orders
    time_machine:
      schema_lock:
        enabled: true
        on_violation: block
        track: [columns, types, nullability]
```

Schema snapshots are stored in `.conduit/locks/` as JSON:

```json
{
  "source": "orders",
  "locked_at": "2026-03-27T10:00:00Z",
  "locked_by": "conduit run",
  "columns": [
    { "name": "order_id",   "type": "INTEGER", "nullable": false },
    { "name": "amount",     "type": "DECIMAL", "nullable": false },
    { "name": "updated_at", "type": "TIMESTAMP", "nullable": true }
  ]
}
```

### Config Versioning

Conduit hashes `pipeline.yaml` on each run and stores timestamped snapshots in `.conduit/history/`. Users can view the history, diff any two versions, and revert to a previous config. Optionally, the config can be locked so modifications require an explicit `conduit unlock` before the pipeline runs.

```yaml
time_machine:
  config_lock:
    enabled: true
    on_violation: warn
  history:
    retain: 30                   # days to keep snapshots
    path: .conduit/history/
```

### Storage Layout

```
.conduit/
├── locks/
│   ├── orders.schema.json
│   ├── customers.schema.json
│   └── snowflake_analytics.schema.json
├── history/
│   ├── 2026-03-27T10:00:00.yaml
│   └── 2026-03-27T16:00:00.yaml
└── checkpoints/
    └── orders_to_warehouse/
        ├── state.json
        ├── watermarks.json
        └── manifest.json
```

### Time Machine CLI

| Command                                      | Description                              |
| -------------------------------------------- | ---------------------------------------- |
| `conduit lock <pipeline>`                    | Snapshot all source/destination schemas   |
| `conduit lock <pipeline> --source orders`    | Lock a specific source only              |
| `conduit unlock <pipeline>`                  | Remove all locks (re-snapshot on next run) |
| `conduit drift <pipeline>`                   | Check for drift without running           |
| `conduit history <pipeline>`                 | List config versions with timestamps      |
| `conduit history <pipeline> --diff v1 v2`   | Diff two config versions                  |
| `conduit revert <pipeline> --to <timestamp>` | Restore a previous config version        |

---

## Disk Space Pre-check

Conduit runs on user desktops and servers where local disk space is not guaranteed. A pipeline that fails mid-run due to a full disk wastes time, leaves partial state, and can corrupt checkpoints. Conduit prevents this by checking available storage **before** the pipeline starts.

### How It Works

1. **Estimate** — Before extraction begins, Conduit estimates the disk space required for the run. For incremental loads, the estimate is based on the watermark delta; for full loads, it queries source row counts and average row sizes.
2. **Check** — The estimated requirement (plus a configurable safety buffer) is compared against available disk space in the working directory.
3. **Decide** — If insufficient space is detected:
   - `on_failure: block` — pipeline refuses to start
   - `on_failure: warn` — logs a warning and proceeds (useful when estimates are conservative)

```yaml
runtime:
  disk_check:
    enabled: true
    min_free_gb: 5                 # minimum free space required to start
    safety_buffer_pct: 20          # extra headroom as % of estimated need
    on_failure: block              # block | warn
```

### What Gets Checked

| Check                  | Description                                      |
| ---------------------- | ------------------------------------------------ |
| Working directory      | Where DuckDB temp files and Arrow buffers live    |
| Checkpoint directory   | `.conduit/checkpoints/` — must have room for state |
| Output directory       | For CSV/file destinations writing locally          |

If space drops below a critical threshold **during** a run, Conduit pauses extraction, flushes the current chunk to the destination, writes a checkpoint, and stops gracefully — avoiding partial corruption.

---

## Chunk-based Streaming

Conduit processes data in **chunks** (configurable batch sizes) across the entire pipeline — extract, transform, and load. This keeps local storage usage bounded regardless of dataset size.

### How It Works

```
Source          Extract           Transform          Load           Destination
  │               │                  │                │                │
  │  chunk 1      │                  │                │                │
  ├──────────────▶│  Arrow batch     │                │                │
  │               ├─────────────────▶│  DuckDB SQL    │                │
  │               │                  ├───────────────▶│  batch write   │
  │               │                  │                ├───────────────▶│
  │               │                  │    ✓ flush     │                │
  │  chunk 2      │                  │                │                │
  ├──────────────▶│  Arrow batch     │                │                │
  │               ├─────────────────▶│  DuckDB SQL    │                │
  │               │                  ├───────────────▶│  batch write   │
  │               │                  │                ├───────────────▶│
  │               │                  │    ✓ flush     │                │
  ...             ...                ...              ...              ...
```

1. **Extract** — The connector pulls `chunk_size` rows at a time from the source (cursor-based for databases, file-range for S3/CSV).
2. **Normalize** — Each chunk is converted to an Apache Arrow batch independently.
3. **Transform** — DuckDB processes each Arrow batch through the user's SQL. Stateful operations (window functions, aggregations) accumulate across chunks using DuckDB's streaming mode.
4. **Load** — The transformed chunk is immediately written to the destination in a single batch. Once the destination confirms the write, the local Arrow buffer is released.

### Configuration

```yaml
runtime:
  chunking:
    extract_chunk_size: 10000      # rows per extract batch
    load_batch_size: 5000          # rows per destination write
    max_memory_mb: 512             # memory ceiling — Conduit spills to disk beyond this
    spill_to_disk: true            # allow DuckDB to use temp files for large transforms
```

### Why This Matters

- A 100 million row pipeline uses the same local storage as a 10,000 row pipeline
- No risk of filling the disk with intermediate data
- Memory usage stays predictable and bounded
- Each chunk is a natural checkpoint boundary (see below)

---

## Checkpoint & Resume

Network failures, machine restarts, and transient errors should not force a pipeline to restart from scratch. Conduit tracks progress at the chunk level and resumes from the last successful checkpoint.

### How It Works

1. **Checkpoint creation** — After each chunk is successfully extracted, transformed, and loaded, Conduit writes a checkpoint to `.conduit/checkpoints/`:
   - Source watermark position (which rows have been read)
   - Destination write cursor (which chunks have been confirmed)
   - Pipeline state hash (to detect config changes between runs)

2. **Failure handling** — When a pipeline fails (network error, timeout, crash):
   - The current in-flight chunk is abandoned (not partially written)
   - The last confirmed checkpoint is preserved
   - Conduit logs the exact failure point: source, chunk number, row range, and error

3. **Resume** — On the next run, Conduit detects the checkpoint and asks:
   - Auto-resume: `conduit run pipeline.yaml` — automatically resumes if a checkpoint exists
   - Force restart: `conduit run pipeline.yaml --restart` — ignores checkpoints and starts fresh
   - Manual resume: `conduit resume pipeline.yaml` — explicitly resume a failed run

### Checkpoint Storage

```
.conduit/
├── checkpoints/
│   └── orders_to_warehouse/
│       ├── state.json              # current progress
│       ├── watermarks.json         # per-source extraction position
│       └── manifest.json           # chunk-level completion log
```

**`state.json`** example:

```json
{
  "pipeline": "orders_to_warehouse",
  "status": "interrupted",
  "started_at": "2026-03-27T10:00:00Z",
  "failed_at": "2026-03-27T10:05:23Z",
  "error": "ConnectionError: snowflake connection timed out",
  "progress": {
    "total_chunks": 150,
    "completed_chunks": 87,
    "rows_extracted": 870000,
    "rows_loaded": 870000
  }
}
```

**`manifest.json`** tracks each chunk:

```json
{
  "chunks": [
    { "id": 1, "status": "loaded", "rows": 10000, "watermark": "2026-03-01T00:00:00Z" },
    { "id": 2, "status": "loaded", "rows": 10000, "watermark": "2026-03-01T02:15:00Z" },
    { "id": 88, "status": "failed", "rows": 0, "error": "connection_timeout" }
  ]
}
```

### Configuration

```yaml
runtime:
  checkpoint:
    enabled: true
    auto_resume: true              # auto-resume on next run if checkpoint exists
    retention: 7                   # days to keep completed checkpoints
    path: .conduit/checkpoints/
```

### Checkpoint CLI

| Command                                       | Description                                  |
| --------------------------------------------- | -------------------------------------------- |
| `conduit resume <pipeline>`                   | Resume a failed pipeline from last checkpoint |
| `conduit run <pipeline> --restart`            | Ignore checkpoint, start fresh                |
| `conduit checkpoint status <pipeline>`        | Show checkpoint state and progress            |
| `conduit checkpoint clean <pipeline>`         | Remove checkpoints for a pipeline             |
| `conduit checkpoint clean --all`              | Remove all checkpoints                        |

### Resume Flow

```bash
# First run — fails at chunk 88 of 150
conduit run pipeline.yaml
# ✗ Pipeline failed: ConnectionError at chunk 88/150
# ✓ Checkpoint saved — 87 chunks (870,000 rows) completed
# Run "conduit run pipeline.yaml" to resume

# Second run — resumes automatically
conduit run pipeline.yaml
# ✓ Resuming from checkpoint: chunk 88/150
# Extracted 630,000 remaining rows
# Loaded 630,000 rows -> snowflake.analytics.orders
# ✓ Pipeline complete: 1,500,000 total rows
```

---

## Vault — Credential Resolution

Secrets are never stored in pipeline configs or logs. The Conduit Vault stores all credentials encrypted with **AES-256**, using the OS keychain for key derivation (Keychain on macOS, Credential Manager on Windows, libsecret on Linux). Credentials are resolved per-run and never cached in memory longer than needed.

```yaml
# pipeline.yaml — no secrets ever stored here
sources:
  - name: orders
    type: postgres
    connection: my-pg-conn  # vault resolves credentials at runtime
```

Rotating a secret in the vault takes effect on the next run automatically — no pipeline changes required.

---

## Connector Module System

Each data source and destination is packaged as an independent connector module. Connectors can be installed, enabled, disabled, or removed per project — keeping the core lean and only pulling in what each use case requires.

```bash
conduit connector install postgres
conduit connector enable bigquery
conduit connector disable mongodb
conduit connector list
```

| Connector   | Type       | Capabilities                  |
| ----------- | ---------- | ----------------------------- |
| postgres    | src + dest | incremental, schema inference |
| mysql       | src + dest | incremental, schema inference |
| bigquery    | dest       | incremental                   |
| mongodb     | src + dest | schema inference              |
| csv / tsv   | src + dest | schema inference              |
| excel       | src        | —                             |
| s3          | src + dest | incremental                   |
| snowflake   | dest       | incremental, schema inference |

---

## CLI Design

| Command                                     | Description                          |
| ------------------------------------------- | ------------------------------------ |
| `conduit up`                                | Start daemon, API server, and web UI |
| `conduit down`                              | Stop everything                      |
| `conduit status`                            | Show running state and connections   |
| `conduit run pipeline.yaml`                 | Execute a pipeline                   |
| `conduit run pipeline.yaml --dry-run`       | Validate without loading             |
| `conduit query "SELECT ..." --source conn`  | Run an ad-hoc query                  |
| `conduit vault add / list / get / delete`   | Manage encrypted secrets             |
| `conduit connector list / install / enable` | Manage connectors                    |
| `conduit serve --port 4000`                 | Start API + web app only             |
| `conduit resume <pipeline>`                 | Resume a failed pipeline from checkpoint |
| `conduit run <pipeline> --restart`          | Ignore checkpoint, start fresh       |
| `conduit checkpoint status <pipeline>`      | Show checkpoint progress             |
| `conduit checkpoint clean <pipeline>`       | Remove checkpoints for a pipeline    |
