# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec file for Conduit ETL.

Produces a single-file executable that bundles DuckDB, PyArrow, and all
dependencies. No Python installation required on the target machine.

Build:  pyinstaller conduit.spec --noconfirm --clean
Output: dist/conduit (or dist/conduit.exe on Windows)
"""

from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

block_cipher = None

# --- Native library collection ---
# DuckDB ships a compiled C++ extension that PyInstaller's import analysis misses
duckdb_binaries = collect_dynamic_libs("duckdb")

# PyArrow has ~15 native shared objects (.so/.dylib/.dll) plus data files
pyarrow_binaries = collect_dynamic_libs("pyarrow")
pyarrow_datas = collect_data_files("pyarrow")

a = Analysis(
    ["src/conduit/cli.py"],
    pathex=[],
    binaries=duckdb_binaries + pyarrow_binaries,
    datas=pyarrow_datas,
    hiddenimports=[
        # DuckDB
        "duckdb",
        # PyArrow internals
        "pyarrow",
        "pyarrow.lib",
        "pyarrow.csv",
        "pyarrow.compute",
        "pyarrow._parquet",
        # Pydantic v2 metaprogramming modules
        "pydantic",
        "pydantic.deprecated.decorator",
        "pydantic._internal._config",
        "pydantic._internal._generate_schema",
        "pydantic._internal._validators",
        "pydantic._internal._core_utils",
        # YAML
        "yaml",
        # Typer / Click
        "typer",
        "typer.main",
        "click",
        "click.core",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Reduce binary size — none of these are used by Conduit
        "tkinter",
        "matplotlib",
        "PIL",
        "scipy",
        "numpy.tests",
        "test",
        "unittest",
    ],
    noarchive=False,
    optimize=0,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="conduit",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
