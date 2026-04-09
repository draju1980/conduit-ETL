/**
 * Tests for validation/models.ts — ValidationReport summary and state.
 */

import { assertEquals } from "@std/assert";
import { ValidationReport } from "../../../src/ts/validation/models.ts";

Deno.test("report: passed is true when all checks pass", () => {
  const report = new ValidationReport("test");
  report.findings.push({
    checkType: "schema",
    status: "pass",
    message: "ok",
    timestamp: new Date(),
  });
  assertEquals(report.passed, true);
});

Deno.test("report: passed is false when any check fails", () => {
  const report = new ValidationReport("test");
  report.findings.push({
    checkType: "schema",
    status: "pass",
    message: "ok",
    timestamp: new Date(),
  });
  report.findings.push({
    checkType: "custom",
    status: "fail",
    message: "bad",
    timestamp: new Date(),
  });
  assertEquals(report.passed, false);
});

Deno.test("report: summary includes pass and fail counts", () => {
  const report = new ValidationReport("test");
  report.findings.push({
    checkType: "schema",
    status: "pass",
    message: "ok",
    timestamp: new Date(),
  });
  report.findings.push({
    checkType: "custom",
    status: "fail",
    message: "bad",
    timestamp: new Date(),
  });
  assertEquals(report.summary.includes("1 passed"), true);
  assertEquals(report.summary.includes("1 failed"), true);
});

Deno.test("report: warn does not count as failure", () => {
  const report = new ValidationReport("test");
  report.findings.push({
    checkType: "row_count",
    status: "warn",
    message: "low count",
    timestamp: new Date(),
  });
  assertEquals(report.passed, true);
});
