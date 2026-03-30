"""Individual validation check implementations."""

from __future__ import annotations

import duckdb
import pyarrow as pa
import pyarrow.compute as pc

from conduit.models import ValidationCheck
from conduit.validation.models import ValidationFinding

# Arrow type name → accepted YAML type names
TYPE_MAP: dict[str, list[str]] = {
    "int8": ["INTEGER", "INT", "SMALLINT", "TINYINT"],
    "int16": ["INTEGER", "INT", "SMALLINT"],
    "int32": ["INTEGER", "INT"],
    "int64": ["INTEGER", "INT", "BIGINT"],
    "uint8": ["INTEGER", "INT"],
    "uint16": ["INTEGER", "INT"],
    "uint32": ["INTEGER", "INT"],
    "uint64": ["INTEGER", "INT", "BIGINT"],
    "float": ["FLOAT", "REAL", "DECIMAL", "NUMERIC", "DOUBLE"],
    "double": ["FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL"],
    "decimal128": ["DECIMAL", "NUMERIC"],
    "string": ["VARCHAR", "TEXT", "STRING", "CHAR"],
    "large_string": ["VARCHAR", "TEXT", "STRING", "CHAR"],
    "utf8": ["VARCHAR", "TEXT", "STRING", "CHAR"],
    "large_utf8": ["VARCHAR", "TEXT", "STRING", "CHAR"],
    "bool": ["BOOLEAN", "BOOL"],
    "timestamp[us]": ["TIMESTAMP", "DATETIME"],
    "timestamp[ns]": ["TIMESTAMP", "DATETIME"],
    "timestamp[ms]": ["TIMESTAMP", "DATETIME"],
    "timestamp[s]": ["TIMESTAMP", "DATETIME"],
    "timestamp[us, tz=UTC]": ["TIMESTAMP", "DATETIME"],
    "timestamp[ns, tz=UTC]": ["TIMESTAMP", "DATETIME"],
    "date32": ["DATE"],
    "date32[day]": ["DATE"],
    "time32[ms]": ["TIME"],
    "time64[us]": ["TIME"],
}


def _arrow_type_matches(arrow_type_str: str, expected_type: str) -> bool:
    """Check if an Arrow type string matches an expected YAML type name."""
    expected_upper = expected_type.upper()
    # Direct match against type map
    accepted = TYPE_MAP.get(arrow_type_str, [])
    if expected_upper in accepted:
        return True
    # Fallback: check if the arrow type string contains the expected type
    if expected_upper.lower() in arrow_type_str.lower():
        return True
    return False


def validate_schema(table: pa.Table, check: ValidationCheck) -> ValidationFinding:
    """Validate that the table schema matches expected columns and types."""
    actual_cols = {f.name: str(f.type) for f in table.schema}
    issues = []

    for col_spec in check.columns:
        if isinstance(col_spec, str):
            # Simple column name check
            if col_spec not in actual_cols:
                issues.append(f"Missing column: {col_spec}")
        else:
            # Column with type check
            if col_spec.name not in actual_cols:
                issues.append(f"Missing column: {col_spec.name}")
            elif not _arrow_type_matches(actual_cols[col_spec.name], col_spec.type):
                issues.append(
                    f"Column '{col_spec.name}': expected {col_spec.type}, "
                    f"got {actual_cols[col_spec.name]}"
                )

    if issues:
        return ValidationFinding(
            check_type="schema",
            status="fail",
            message=f"Schema check failed: {len(issues)} issue(s)",
            details={"issues": issues, "actual_columns": actual_cols},
        )

    return ValidationFinding(
        check_type="schema",
        status="pass",
        message=f"Schema check passed: all {len(check.columns)} column(s) match",
        details={"actual_columns": actual_cols},
    )


def validate_null_check(table: pa.Table, check: ValidationCheck) -> ValidationFinding:
    """Validate that specified columns have no null values."""
    null_counts: dict[str, int] = {}

    for col_name in check.columns:
        name = col_name if isinstance(col_name, str) else col_name.name
        if name not in table.column_names:
            null_counts[name] = -1  # column missing
            continue
        col = table.column(name)
        count = pc.sum(pc.is_null(col)).as_py()
        if count > 0:
            null_counts[name] = count

    if null_counts:
        missing = [c for c, n in null_counts.items() if n == -1]
        with_nulls = {c: n for c, n in null_counts.items() if n > 0}
        parts = []
        if missing:
            parts.append(f"missing columns: {', '.join(missing)}")
        if with_nulls:
            parts.append(", ".join(f"{c} ({n} nulls)" for c, n in with_nulls.items()))
        return ValidationFinding(
            check_type="null_check",
            status="fail",
            message=f"Null check failed: {'; '.join(parts)}",
            details={"null_counts": null_counts},
        )

    col_names = [c if isinstance(c, str) else c.name for c in check.columns]
    return ValidationFinding(
        check_type="null_check",
        status="pass",
        message=f"Null check passed: no nulls in {', '.join(col_names)}",
    )


def validate_row_count(table: pa.Table, check: ValidationCheck) -> ValidationFinding:
    """Validate that row count falls within the expected range."""
    actual = len(table)
    min_rows = check.min
    max_rows = check.max

    issues = []
    if min_rows is not None and actual < min_rows:
        issues.append(f"row count {actual} is below minimum {min_rows}")
    if max_rows is not None and actual > max_rows:
        issues.append(f"row count {actual} exceeds maximum {max_rows}")

    if issues:
        return ValidationFinding(
            check_type="row_count",
            status="fail",
            message=f"Row count check failed: {'; '.join(issues)}",
            details={"actual": actual, "min": min_rows, "max": max_rows},
        )

    return ValidationFinding(
        check_type="row_count",
        status="pass",
        message=f"Row count check passed: {actual} rows (range: {min_rows}-{max_rows})",
        details={"actual": actual, "min": min_rows, "max": max_rows},
    )


def validate_custom(table: pa.Table, check: ValidationCheck) -> ValidationFinding:
    """Run custom SQL validation. The query should return violating rows."""
    if not check.sql:
        return ValidationFinding(
            check_type="custom",
            status="fail",
            message="Custom validation failed: no SQL provided",
        )

    try:
        conn = duckdb.connect(":memory:")
        conn.register("__result__", table)
        result = conn.execute(check.sql).to_arrow_table()
        conn.close()
    except Exception as e:
        return ValidationFinding(
            check_type="custom",
            status="fail",
            message=f"Custom validation SQL error: {e}",
            details={"sql": check.sql, "error": str(e)},
        )

    violation_count = len(result)
    if violation_count > 0:
        # Show sample of violating rows (up to 5)
        sample = result.slice(0, min(5, violation_count)).to_pydict()
        return ValidationFinding(
            check_type="custom",
            status="fail",
            message=f"Custom validation failed: {violation_count} violating row(s) found",
            details={"violation_count": violation_count, "sample": sample, "sql": check.sql},
        )

    return ValidationFinding(
        check_type="custom",
        status="pass",
        message="Custom validation passed: no violating rows found",
        details={"sql": check.sql},
    )


VALIDATORS = {
    "schema": validate_schema,
    "null_check": validate_null_check,
    "row_count": validate_row_count,
    "custom": validate_custom,
}
