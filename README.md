# Conduit-ETL

**Open-source, local-first ELT workbench for data engineers.**

Pull data from heterogeneous sources, transform with SQL, validate with built-in checks, and load to destinations — all from a single CLI tool built on Deno + TypeScript.

[![CI](https://github.com/mdraju/conduit-ETL/actions/workflows/ci.yml/badge.svg)](https://github.com/mdraju/conduit-ETL/actions/workflows/ci.yml)
[![JSR](https://jsr.io/badges/@conduit/etl)](https://jsr.io/@conduit/etl)
![Deno](https://img.shields.io/badge/deno-2.x-blue)
![Version](https://img.shields.io/badge/version-0.1.0-green)
![License](https://img.shields.io/badge/license-MIT-brightgreen)

## Features

- **SQL transforms** — DuckDB-powered engine: JOINs, CTEs, aggregations, and window functions across all sources
- **10 destination types** — CSV, JSON, JSONL, Parquet, PostgreSQL, MySQL, Snowflake, BigQuery, MongoDB, and S3
- **Validation pipeline** — schema checks, null checks, row counts, custom SQL assertions, and dry-run mode before any data lands
- **Configurable failure policy** — per-check `fail` or `warn` behavior with JSON validation reports
- **YAML-driven pipelines** — declarative `pipeline.yaml` config with Zod validation
- **Connector management CLI** — `conduit source add/rm/enable/disable/list` and `conduit destination add/rm/enable/disable/list`
- **JSR-distributed** — install directly from [jsr.io](https://jsr.io/@conduit/etl) with a single command

## Installation

Conduit is distributed via **[JSR](https://jsr.io/@conduit/etl)** — install directly to your desktop or server with a single command. No binaries to download, no package managers to configure.

### Prerequisites

- [Deno](https://deno.com) 2.x or later — install with `curl -fsSL https://deno.land/install.sh | sh`

### Install Conduit CLI globally

```bash
deno install -Agf -n conduit jsr:@conduit/etl/cli
```

This installs `conduit` as a global command on your machine. Flags explained:

| Flag | Purpose |
| --- | --- |
| `-A` | Grant all permissions (file, network, env, FFI — required for DuckDB and database drivers) |
| `-g` | Install globally (not scoped to current project) |
| `-f` | Force overwrite if already installed |
| `-n conduit` | Name the installed command `conduit` |

Make sure `~/.deno/bin` is in your `PATH`:

```bash
export PATH="$HOME/.deno/bin:$PATH"
```

### Verify the installation

```bash
conduit version
# conduit 0.1.0
#
# Components:
#   Deno                           2.x.x
#   DuckDB                         1.5.1
#   Zod                            3.x.x
#   ...
```

### Update to the latest version

```bash
deno install -Agf -n conduit jsr:@conduit/etl/cli
```

Re-running `deno install` pulls the latest version from JSR.

### Uninstall

```bash
deno uninstall conduit
```

### Why JSR

- **Cross-platform by default** — one install command works on macOS (Intel + Apple Silicon), Linux, and Windows
- **Native dependencies handled** — DuckDB and database drivers are resolved automatically per platform
- **No binary downloads** — no need to pick the right binary or manage GitHub release artifacts
- **Instant updates** — re-run `deno install` to pull the latest published version

## Quick Start

Once installed, run a pipeline:

```bash
# Check installed version
conduit version

# Execute a pipeline
conduit run pipeline.yaml

# Validate without loading (dry-run mode)
conduit run pipeline.yaml --dry-run

# Run validation only
conduit validate pipeline.yaml

# List destination connectors
conduit destination list
```

### Use as a library

```typescript
import { runPipeline, loadPipeline } from "jsr:@conduit/etl";

await runPipeline("pipeline.yaml");
```

Or add to your project's `deno.json`:

```json
{
  "imports": {
    "@conduit/etl": "jsr:@conduit/etl@^0.1.0"
  }
}
```

## Pipeline Configuration

Pipelines are defined in YAML. Here's a working example:

```yaml
pipeline:
  name: orders_enriched

sources:
  - name: orders
    type: csv
    config:
      path: data/orders.csv

  - name: regions
    type: csv
    config:
      path: data/regions.csv

transform:
  sql: |
    SELECT o.order_id, o.customer_id, o.amount, o.status, r.region
    FROM orders o
    JOIN regions r ON o.region_id = r.id
    WHERE o.status = 'active'

validation:
  - type: schema
    columns:
      - { name: order_id, type: INTEGER }
      - { name: amount, type: DECIMAL }
    on_failure: fail

  - type: null_check
    columns: [order_id, customer_id, amount]
    on_failure: fail

  - type: row_count
    min: 1
    max: 10000000
    on_failure: warn

  - type: custom
    sql: |
      SELECT * FROM __result__
      WHERE amount < 0
    on_failure: fail

destinations:
  - name: output
    type: csv
    mode: full_refresh
    config:
      path: output/result.csv

  # Or load to a database:
  # - name: warehouse
  #   type: postgres
  #   mode: full_refresh
  #   config:
  #     host: localhost
  #     port: 5432
  #     database: analytics
  #     user: conduit
  #     password: ${PG_PASSWORD}
  #     schema: public
  #     table: orders_enriched
```

## CLI Reference

> **Status:** DONE = implemented | PLANNED = not yet implemented. See [PLAN.md](PLAN.md) for the full architecture and roadmap.

| Command | Description | Status |
| --- | --- | --- |
| **General** | | |
| `conduit version` | Show Conduit version + component versions | DONE |
| `conduit init` | Initialize a new Conduit project (creates `.conduit/` and sample `pipeline.yaml`) | PLANNED |
| `conduit up` | Start daemon, scheduler, API server, and web UI | PLANNED |
| `conduit down` | Stop everything | PLANNED |
| `conduit status` | Show running state and connections | PLANNED |
| **Templates** | | |
| `conduit template list` | List all available pipeline templates | PLANNED |
| `conduit template init <name>` | Generate a pipeline.yaml from a template | PLANNED |
| `conduit template init --source X --dest Y` | Generate template by connector combination | PLANNED |
| `conduit template init <name> --print` | Print template to terminal without writing file | PLANNED |
| **Running** | | |
| `conduit run pipeline.yaml` | Execute a pipeline | DONE |
| `conduit run pipeline.yaml --dry-run` | Validate without loading | DONE |
| `conduit run pipeline.yaml --restart` | Ignore checkpoint, start fresh | PLANNED |
| `conduit query "SELECT ..." --source conn` | Run an ad-hoc query | PLANNED |
| **Scheduling** | | |
| `conduit schedule pipeline.yaml --cron "..."` | Schedule a pipeline with cron expression | PLANNED |
| `conduit schedule pipeline.yaml --every 1h` | Schedule a pipeline by interval | PLANNED |
| `conduit unschedule pipeline.yaml` | Remove a pipeline schedule | PLANNED |
| `conduit pipeline list` | List all pipelines with schedule and status | PLANNED |
| `conduit pipeline status <name>` | Detailed status of a single pipeline | PLANNED |
| `conduit pipeline pause <name>` | Pause a scheduled pipeline | PLANNED |
| `conduit pipeline resume <name>` | Resume a paused pipeline | PLANNED |
| `conduit pipeline trigger <name>` | Manually trigger a pipeline run | PLANNED |
| **Validation** | | |
| `conduit validate pipeline.yaml` | Run validation suite without loading | DONE |
| `conduit report list` | List generated quality reports | PLANNED |
| `conduit report open pipeline.yaml` | Open latest report in browser | PLANNED |
| **Vault** | | |
| `conduit vault add / list / get / delete` | Manage encrypted secrets | PLANNED |
| **Source Connectors** | | |
| `conduit source add <connector>` | Add and enable a source connector module | DONE |
| `conduit source rm <connector>` | Remove a source connector module | DONE |
| `conduit source enable <connector>` | Enable a disabled source connector | DONE |
| `conduit source disable <connector>` | Disable source without removing | DONE |
| `conduit source list` | List all source connectors and their status | DONE |
| **Destination Connectors** | | |
| `conduit destination add <connector>` | Add and enable a destination connector module | DONE |
| `conduit destination rm <connector>` | Remove a destination connector module | DONE |
| `conduit destination enable <connector>` | Enable a disabled destination connector | DONE |
| `conduit destination disable <connector>` | Disable destination without removing | DONE |
| `conduit destination list` | List all destination connectors and their status | DONE |
| **Time Machine** | | |
| `conduit lock / unlock / drift <pipeline>` | Schema lock management | PLANNED |
| `conduit history / revert <pipeline>` | Config version management | PLANNED |
| **Checkpoints** | | |
| `conduit resume <pipeline>` | Resume a failed pipeline | PLANNED |
| `conduit checkpoint status / clean <pipeline>` | Checkpoint management | PLANNED |
| **Server** | | |
| `conduit serve --port 4000` | Start API + web app only (no scheduler) | PLANNED |

## Validation Checks

Conduit includes a built-in validation framework that runs after transform and before load:

| Check | Description | Config |
| --- | --- | --- |
| `schema` | Verify output columns match expected names and types | `columns: [{name, type}]` |
| `null_check` | Assert required fields contain no nulls | `columns: [col1, col2]` |
| `row_count` | Catch empty result sets or unexpected row counts | `min:` / `max:` |
| `custom` | Arbitrary SQL assertions (rows returned = failures) | `sql:` (use `__result__` table) |

Each check supports `on_failure: fail` (blocks load) or `on_failure: warn` (logs warning, continues).

Validation reports are saved as JSON to `.conduit/reports/`.

## Architecture

```
Sources              Engine                   Validation              Destinations
+--------------+    +------------------+     +------------------+    +------------------+
| CSV / TSV    |--->| DuckDB SQL       |--->| Schema checks    |--->| CSV / JSON(L)    |
|              |    | (JOINs, CTEs,    |    | Null checks      |    | Parquet / S3     |
|              |    |  window funcs)   |    | Row counts       |    | PostgreSQL/MySQL |
+--------------+    +------------------+    | Custom SQL       |    | Snowflake / BQ   |
                     In-memory engine        +------------------+    | MongoDB          |
                     Virtual tables          JSON reports            +------------------+
```

**Pipeline flow:** Extract (CSV/TSV) -> Transform (DuckDB SQL) -> Validate (4 check types) -> Load (10 destination types)

## Tech Stack

| Component | Technology | Purpose |
| --- | --- | --- |
| Runtime | Deno 2.x | TypeScript-first, secure by default |
| SQL Engine | DuckDB (`@duckdb/node-api`) | In-process OLAP: transforms, joins, aggregations |
| Config Validation | Zod | Strict YAML schema validation with typed models |
| Config Format | `@std/yaml` | Pipeline definition in `pipeline.yaml` |
| CLI Framework | Cliffy | Command-line interface |
| Testing | `Deno.test` + `@std/assert` | Built-in test runner with coverage |
| Distribution | JSR (jsr.io) | Package registry for Deno / TypeScript |

## Destination Connectors

| Connector | Status | Driver |
| --- | --- | --- |
| CSV | Ready | `@std/csv` (built-in) |
| JSON | Ready | (built-in) |
| JSONL | Ready | (built-in) |
| Parquet | Ready | DuckDB `COPY TO` (built-in) |
| PostgreSQL | Ready | `npm:postgres` |
| MySQL | Ready | `npm:mysql2` |
| Snowflake | Ready | `npm:snowflake-sdk` |
| BigQuery | Ready | `npm:@google-cloud/bigquery` |
| MongoDB | Ready | `npm:mongodb` |
| S3 | Ready | `npm:@aws-sdk/client-s3` |

Use the CLI to manage destination connectors:

```bash
conduit destination list              # list all available connectors
conduit destination add postgres      # enable a destination connector
```

## The `.conduit/` Directory

Conduit stores all runtime state in a `.conduit/` directory relative to your pipeline:

```
.conduit/
├── reports/          # JSON validation reports (one per run)
├── checkpoints/      # Resume state for failed pipelines (planned)
├── locks/            # Schema snapshots for drift detection (planned)
├── history/          # Pipeline config version history (planned)
└── dead_letter/      # Failed rows for manual review (planned)
```

Add `.conduit/checkpoints/` and `.conduit/dead_letter/` to `.gitignore`. Reports and locks are safe to commit.

## Development

### Setup

```bash
# Clone the repo
git clone https://github.com/mdraju/conduit-ETL.git
cd conduit-ETL

# Install dependencies (DuckDB native binding requires scripts permission)
deno install --allow-scripts=npm:@duckdb/node-bindings
```

### Running locally

```bash
# Run the CLI directly from source
deno task dev run pipeline.yaml

# Or use deno run directly
deno run -A main.ts run pipeline.yaml
```

### Testing

```bash
# Run all tests
deno task test

# Run tests with coverage
deno task test:cov

# Watch mode
deno task test:watch
```

### Linting & formatting

```bash
deno task lint       # Lint source and tests
deno task fmt        # Auto-format
deno task check      # Type check
```

### Publishing to JSR

```bash
# Dry run — validates the package without publishing
deno task publish:dry

# Publish to jsr.io (requires scope ownership and auth)
deno task publish
```

Releases are triggered automatically by pushing a `v*` tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Project Structure

```
.
├── deno.json                  # Deno config, tasks, imports
├── main.ts                    # CLI entry point
├── mod.ts                     # Public library API
├── src/ts/
│   ├── cli.ts                 # Cliffy CLI
│   ├── config.ts              # YAML + Zod config loader
│   ├── models.ts              # Zod schemas (16 models)
│   ├── pipeline.ts            # Orchestrator (extract->transform->validate->load)
│   ├── util.ts                # Shared utilities
│   ├── engine/
│   │   ├── extract.ts         # CSV/TSV source extractors
│   │   └── transform.ts       # DuckDB SQL transform engine
│   ├── loader/
│   │   ├── mod.ts             # Loader registry
│   │   ├── csv_loader.ts
│   │   ├── json_loader.ts
│   │   ├── parquet_loader.ts
│   │   ├── postgres_loader.ts
│   │   ├── mysql_loader.ts
│   │   ├── snowflake_loader.ts
│   │   ├── bigquery_loader.ts
│   │   ├── mongodb_loader.ts
│   │   └── s3_loader.ts
│   └── validation/
│       ├── models.ts          # ValidationFinding, ValidationReport
│       ├── validators.ts      # 4 validator implementations
│       ├── runner.ts          # Validation orchestrator
│       └── reporter.ts        # JSON report + logging
└── tests/ts/
    ├── config_test.ts
    ├── transform_test.ts
    ├── validation_test.ts
    ├── pipeline_test.ts
    └── fixtures/
        ├── helpers.ts
        ├── orders.csv
        ├── regions.csv
        └── sample_pipeline.yaml
```

## Roadmap

Key planned features:

- **Database sources** — PostgreSQL, MySQL, MongoDB, BigQuery, Snowflake, S3 extractors
- **Incremental loads** — watermark-based extract with merge/append strategies
- **Error handling & retries** — configurable retry backoff, skip_batch, dead-letter routing
- **Environment variables** — `${VAR}` substitution in pipeline configs
- **Chunked streaming** — bounded memory processing for large datasets
- **Checkpoint & resume** — pick up failed pipelines from last successful chunk
- **Schema locking** — detect source/destination drift before it breaks pipelines

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and add tests
4. Run the test suite (`deno task test`)
5. Commit and push (`git push origin feature/my-feature`)
6. Open a Pull Request

## License

MIT — see [LICENSE](LICENSE) for details.
