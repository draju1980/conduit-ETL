# Conduit-ETL

**Open-source, local-first ELT workbench for data engineers.**

Pull data from heterogeneous sources, transform with SQL, and load to destination databases or files — all from a single tool.

## Features

- **Unified SQL transforms** — DuckDB-powered engine lets you JOIN across Postgres, CSV, BigQuery, and more as if they were one database
- **Incremental loads** — watermark tracking extracts only new/updated rows on subsequent runs
- **Encrypted credential vault** — AES-256 secrets backed by OS keychain, resolved at runtime, never stored in configs or logs
- **Pluggable connectors** — install only the sources and destinations you need
- **Validation built in** — schema checks, null checks, row counts, and dry-run mode before any data lands
- **Memory efficient** — streams data in chunks via Apache Arrow interchange format, bounded memory regardless of dataset size
- **Disk space pre-check** — verifies available storage before starting, pauses gracefully if space runs low mid-run
- **Checkpoint & resume** — failed pipelines pick up from the last successful chunk, not from scratch
- **Time Machine** — lock source/destination schemas to catch drift before it breaks pipelines, with per-lock block or warn behavior and full config version history
- **Web UI + CLI** — configure pipelines visually or from the terminal

## Supported Connectors

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

## Quick Start

```bash
# Start the daemon, API server, and web UI
conduit up

# Run a pipeline
conduit run pipeline.yaml

# Run in dry-run mode (validate without loading)
conduit run pipeline.yaml --dry-run

# Ad-hoc query against a connected source
conduit query "SELECT * FROM orders LIMIT 10" --source my-pg-conn
```

## CLI Reference

| Command                                     | Description                          |
| ------------------------------------------- | ------------------------------------ |
| `conduit up`                                | Start daemon, API server, and web UI |
| `conduit down`                              | Stop everything                      |
| `conduit status`                            | Show running state and connections   |
| `conduit run <pipeline>`                    | Execute a pipeline                   |
| `conduit run <pipeline> --dry-run`          | Validate without loading             |
| `conduit query "SQL" --source <conn>`       | Run an ad-hoc query                  |
| `conduit vault add / list / get / delete`   | Manage encrypted secrets             |
| `conduit connector install / enable / list` | Manage connectors                    |
| `conduit lock <pipeline>`                   | Snapshot source/destination schemas  |
| `conduit unlock <pipeline>`                 | Remove locks (re-snapshot on next run) |
| `conduit drift <pipeline>`                  | Check for schema drift without running |
| `conduit history <pipeline>`                | List config version history          |
| `conduit revert <pipeline> --to <ts>`       | Restore a previous config version    |
| `conduit resume <pipeline>`                 | Resume a failed pipeline from checkpoint |
| `conduit checkpoint status <pipeline>`      | Show checkpoint progress             |
| `conduit checkpoint clean <pipeline>`       | Remove checkpoints for a pipeline    |
| `conduit serve --port 4000`                 | Start API + web app only             |

## Pipeline Configuration

Pipelines are defined in YAML. See [`pipeline.yaml`](pipeline.yaml) for the full reference template with all connectors and options, or start with a minimal example:

```yaml
pipeline:
  name: orders_to_snowflake

sources:
  - name: orders
    type: postgres
    connection: my-pg-conn       # credentials resolved from vault at runtime
    config:
      schema: public
      table: orders
    incremental:
      enabled: true
      strategy: timestamp
      watermark_column: updated_at

transform:
  sql: |
    SELECT o.*, r.region
    FROM orders o
    JOIN regions r ON o.region_id = r.id
    WHERE o.status = 'active'

destinations:
  - name: warehouse
    type: snowflake
    connection: my-sf-conn
    mode: incremental
    config:
      database: ANALYTICS
      schema: PUBLIC
      table: ORDERS
      warehouse: COMPUTE_WH
    incremental:
      merge_key: [order_id]
      strategy: merge
```

More examples in [`examples/`](examples/).

## Architecture

```
Sources              Engine                   Destinations
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Postgres     │     │                  │     │ Snowflake        │
│ CSV / Excel  │────▶│  DuckDB (SQL)    │────▶│ BigQuery         │
│ BigQuery     │Arrow│  Validation      │     │ CSV / S3         │
│ MongoDB      │     │                  │     │                  │
└─────────────┘     └──────────────────┘     └──────────────────┘
 Connector layer      In-memory engine         Batch writer
 + Vault secrets      + Schema checks          + Incremental
```

## Project Plan

See [PLAN.md](PLAN.md) for the full architecture and design document.

## License

Open Source — see [LICENSE](LICENSE) for details.
