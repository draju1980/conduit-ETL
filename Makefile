.PHONY: venv install install-build test test-cov lint build smoke-test clean

PYTHON ?= python3
VENV := .venv
BIN := $(VENV)/bin

venv:
	$(PYTHON) -m venv $(VENV)

install: venv
	$(BIN)/pip install -e ".[dev]"

install-build: venv
	$(BIN)/pip install -e ".[build]"

test:
	$(BIN)/pytest tests/ -v --tb=short

test-cov:
	$(BIN)/pytest tests/ -v --cov=conduit --cov-report=term-missing --cov-fail-under=80

build: install-build
	$(BIN)/pyinstaller conduit.spec --noconfirm --clean

smoke-test: build
	dist/conduit --help
	dist/conduit validate tests/fixtures/sample_pipeline.yaml

clean:
	rm -rf build/ dist/ .venv/ *.egg-info .pytest_cache .coverage htmlcov/
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
