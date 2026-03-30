"""Conduit CLI — entry point for the conduit command."""

from __future__ import annotations

import logging
import sys

import typer

from conduit.pipeline import run_pipeline

app = typer.Typer(name="conduit", help="Conduit — Local-first ELT workbench")


def _setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)-7s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stderr,
    )


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


if __name__ == "__main__":
    app()
