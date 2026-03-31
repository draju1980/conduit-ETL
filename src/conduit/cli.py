"""Conduit CLI — entry point for the conduit command."""

from __future__ import annotations

import logging
import sys

import typer

from conduit.pipeline import run_pipeline, _LOADERS

app = typer.Typer(name="conduit", help="Conduit — Local-first ELT workbench")
destination_app = typer.Typer(help="Manage destination connectors")
app.add_typer(destination_app, name="destination")

# Track disabled connectors via a simple set (persisted per-process;
# for durable state a config file would be needed).
_disabled_connectors: set[str] = set()


def _setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)-7s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stderr,
    )


# ── Pipeline commands ────────────────────────────────────────────────

@app.command()
def run(
    pipeline: str = typer.Argument(..., help="Path to pipeline.yaml"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Validate without loading"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Enable debug logging"),
) -> None:
    """Execute a pipeline (extract → transform → validate → load)."""
    _setup_logging(verbose)
    success = run_pipeline(pipeline, validate_only=dry_run)
    if not success:
        raise typer.Exit(code=1)


@app.command()
def validate(
    pipeline: str = typer.Argument(..., help="Path to pipeline.yaml"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Enable debug logging"),
) -> None:
    """Run validation checks without loading (same as --dry-run)."""
    _setup_logging(verbose)
    success = run_pipeline(pipeline, validate_only=True)
    if not success:
        raise typer.Exit(code=1)


# ── Destination connector management ─────────────────────────────────

# Mapping of connector names to their pip install requirements
_CONNECTOR_PACKAGES: dict[str, str] = {
    "csv": "(built-in)",
    "json": "(built-in)",
    "jsonl": "(built-in)",
    "parquet": "(built-in)",
    "postgres": "psycopg2-binary",
    "mysql": "pymysql",
    "snowflake": "snowflake-connector-python[pandas]",
    "bigquery": "google-cloud-bigquery",
    "mongodb": "pymongo",
    "s3": "(built-in)",
}


def _check_connector_available(name: str) -> bool:
    """Check if the connector's driver package can be imported."""
    import_map = {
        "postgres": "psycopg2",
        "mysql": "pymysql",
        "snowflake": "snowflake.connector",
        "bigquery": "google.cloud.bigquery",
        "mongodb": "pymongo",
    }
    mod = import_map.get(name)
    if mod is None:
        return True  # built-in connectors are always available
    try:
        __import__(mod)
        return True
    except ImportError:
        return False


@destination_app.command("list")
def destination_list() -> None:
    """List all destination connectors and their status."""
    typer.echo(f"{'CONNECTOR':<14} {'STATUS':<12} {'DRIVER':<40}")
    typer.echo("-" * 66)
    for name in sorted(_LOADERS):
        if name in _disabled_connectors:
            status = "disabled"
        elif _check_connector_available(name):
            status = "ready"
        else:
            status = "not installed"
        driver = _CONNECTOR_PACKAGES.get(name, "unknown")
        typer.echo(f"{name:<14} {status:<12} {driver:<40}")


@destination_app.command("add")
def destination_add(
    connector: str = typer.Argument(..., help="Connector name (e.g. postgres, mysql, s3)"),
) -> None:
    """Add and enable a destination connector module."""
    if connector not in _LOADERS:
        typer.echo(f"Unknown connector: '{connector}'")
        typer.echo(f"Available connectors: {', '.join(sorted(_LOADERS))}")
        raise typer.Exit(code=1)

    pkg = _CONNECTOR_PACKAGES.get(connector, "")
    if pkg.startswith("("):
        typer.echo(f"Connector '{connector}' is built-in and always available.")
        return

    _disabled_connectors.discard(connector)

    if _check_connector_available(connector):
        typer.echo(f"Connector '{connector}' is already installed and enabled.")
    else:
        typer.echo(f"Connector '{connector}' enabled. Install its driver with:")
        typer.echo(f"  pip install {pkg}")


@destination_app.command("rm")
def destination_rm(
    connector: str = typer.Argument(..., help="Connector name to remove"),
) -> None:
    """Remove (disable) a destination connector module."""
    if connector not in _LOADERS:
        typer.echo(f"Unknown connector: '{connector}'")
        raise typer.Exit(code=1)

    pkg = _CONNECTOR_PACKAGES.get(connector, "")
    if pkg.startswith("("):
        typer.echo(f"Cannot remove built-in connector '{connector}'.")
        raise typer.Exit(code=1)

    _disabled_connectors.add(connector)
    typer.echo(f"Connector '{connector}' removed. To uninstall the driver: pip uninstall {pkg}")


@destination_app.command("enable")
def destination_enable(
    connector: str = typer.Argument(..., help="Connector name to enable"),
) -> None:
    """Enable a previously disabled connector."""
    if connector not in _LOADERS:
        typer.echo(f"Unknown connector: '{connector}'")
        raise typer.Exit(code=1)

    _disabled_connectors.discard(connector)
    typer.echo(f"Connector '{connector}' enabled.")


@destination_app.command("disable")
def destination_disable(
    connector: str = typer.Argument(..., help="Connector name to disable"),
) -> None:
    """Disable a connector without removing its driver."""
    if connector not in _LOADERS:
        typer.echo(f"Unknown connector: '{connector}'")
        raise typer.Exit(code=1)

    _disabled_connectors.add(connector)
    typer.echo(f"Connector '{connector}' disabled.")


if __name__ == "__main__":
    app()
