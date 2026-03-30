"""Tests for the validation engine."""

from __future__ import annotations

import pyarrow as pa

from conduit.models import SchemaColumn, ValidationCheck
from conduit.validation.models import ValidationReport
from conduit.validation.runner import run_validation
from conduit.validation.validators import (
    validate_custom,
    validate_null_check,
    validate_row_count,
    validate_schema,
)


# --- Schema validator ---

def test_schema_pass(sample_table):
    check = ValidationCheck(
        type="schema",
        columns=[
            SchemaColumn(name="order_id", type="INTEGER"),
            SchemaColumn(name="amount", type="DOUBLE"),
            SchemaColumn(name="status", type="VARCHAR"),
        ],
    )
    finding = validate_schema(sample_table, check)
    assert finding.status == "pass"


def test_schema_missing_column(sample_table):
    check = ValidationCheck(
        type="schema",
        columns=[SchemaColumn(name="nonexistent", type="INTEGER")],
    )
    finding = validate_schema(sample_table, check)
    assert finding.status == "fail"
    assert "Missing column" in finding.message or "Missing column" in str(finding.details)


def test_schema_wrong_type(sample_table):
    check = ValidationCheck(
        type="schema",
        columns=[SchemaColumn(name="order_id", type="VARCHAR")],
    )
    finding = validate_schema(sample_table, check)
    assert finding.status == "fail"


# --- Null check validator ---

def test_null_check_pass(sample_table):
    check = ValidationCheck(type="null_check", columns=["order_id", "amount"])
    finding = validate_null_check(sample_table, check)
    assert finding.status == "pass"


def test_null_check_fail(table_with_nulls):
    check = ValidationCheck(type="null_check", columns=["order_id", "customer_id"])
    finding = validate_null_check(table_with_nulls, check)
    assert finding.status == "fail"
    assert finding.details["null_counts"]["order_id"] == 1
    assert finding.details["null_counts"]["customer_id"] == 1


# --- Row count validator ---

def test_row_count_pass(sample_table):
    check = ValidationCheck(type="row_count", min=1, max=100)
    finding = validate_row_count(sample_table, check)
    assert finding.status == "pass"


def test_row_count_below_min(sample_table):
    check = ValidationCheck(type="row_count", min=100, max=1000)
    finding = validate_row_count(sample_table, check)
    assert finding.status == "fail"


def test_row_count_above_max(sample_table):
    check = ValidationCheck(type="row_count", min=1, max=2)
    finding = validate_row_count(sample_table, check)
    assert finding.status == "fail"


# --- Custom SQL validator ---

def test_custom_pass(sample_table):
    check = ValidationCheck(
        type="custom",
        sql="SELECT * FROM __result__ WHERE amount < 0",
    )
    finding = validate_custom(sample_table, check)
    assert finding.status == "pass"


def test_custom_fail(table_with_negatives):
    check = ValidationCheck(
        type="custom",
        sql="SELECT * FROM __result__ WHERE amount < 0",
    )
    finding = validate_custom(table_with_negatives, check)
    assert finding.status == "fail"
    assert finding.details["violation_count"] == 1


def test_custom_invalid_sql(sample_table):
    check = ValidationCheck(type="custom", sql="INVALID SQL HERE")
    finding = validate_custom(sample_table, check)
    assert finding.status == "fail"
    assert "error" in finding.message.lower() or "error" in str(finding.details).lower()


# --- Validation runner (on_failure policy) ---

def test_runner_on_failure_warn_downgrades(sample_table):
    """A failing check with on_failure=warn should produce status 'warn', not 'fail'."""
    checks = [
        ValidationCheck(type="row_count", min=100, max=1000, on_failure="warn"),
    ]
    report = run_validation(sample_table, checks, "test_pipeline")
    assert report.findings[0].status == "warn"
    assert report.passed is True  # warn doesn't block


def test_runner_on_failure_fail_blocks(sample_table):
    """A failing check with on_failure=fail should block the pipeline."""
    checks = [
        ValidationCheck(type="row_count", min=100, max=1000, on_failure="fail"),
    ]
    report = run_validation(sample_table, checks, "test_pipeline")
    assert report.findings[0].status == "fail"
    assert report.passed is False


def test_runner_all_pass(sample_table):
    checks = [
        ValidationCheck(type="null_check", columns=["order_id", "amount"]),
        ValidationCheck(type="row_count", min=1, max=100),
    ]
    report = run_validation(sample_table, checks, "test_pipeline")
    assert report.passed is True
    assert len(report.findings) == 2


def test_runner_mixed_warn_and_fail(sample_table):
    """Even with a passing warn, a single fail should block."""
    checks = [
        ValidationCheck(type="row_count", min=1, max=100, on_failure="warn"),  # passes
        ValidationCheck(type="row_count", min=100, max=1000, on_failure="fail"),  # fails
    ]
    report = run_validation(sample_table, checks, "test_pipeline")
    assert report.passed is False


def test_runner_no_checks(sample_table):
    report = run_validation(sample_table, [], "test_pipeline")
    assert report.passed is True
    assert len(report.findings) == 0


# --- ValidationReport ---

def test_report_summary():
    report = ValidationReport(pipeline_name="test")
    from conduit.validation.models import ValidationFinding
    report.findings = [
        ValidationFinding(check_type="a", status="pass", message="ok"),
        ValidationFinding(check_type="b", status="warn", message="meh"),
        ValidationFinding(check_type="c", status="fail", message="bad"),
    ]
    assert "3 check(s)" in report.summary
    assert "1 passed" in report.summary
    assert "1 warned" in report.summary
    assert "1 failed" in report.summary
    assert report.passed is False
