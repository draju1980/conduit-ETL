import { assertEquals } from "@std/assert";
import {
  validateSchema,
  validateNullCheck,
  validateRowCount,
  validateCustom,
} from "../../src/ts/validation/validators.ts";
import { runValidation } from "../../src/ts/validation/runner.ts";
import { ValidationReport } from "../../src/ts/validation/models.ts";
import {
  createSampleTable,
  createTableWithNulls,
  createTableWithNegatives,
} from "./fixtures/helpers.ts";

Deno.test("validation", async (t) => {
  // ── Schema validator ──────────────────────────
  await t.step("schema: pass", () => {
    const table = createSampleTable();
    const finding = validateSchema(table, {
      type: "schema",
      on_failure: "fail",
      columns: [
        { name: "order_id", type: "INTEGER" },
        { name: "status", type: "VARCHAR" },
      ],
    });
    assertEquals(finding.status, "pass");
  });

  await t.step("schema: missing column", () => {
    const table = createSampleTable();
    const finding = validateSchema(table, {
      type: "schema",
      on_failure: "fail",
      columns: [{ name: "nonexistent", type: "INTEGER" }],
    });
    assertEquals(finding.status, "fail");
  });

  await t.step("schema: wrong type", () => {
    const table = createSampleTable();
    const finding = validateSchema(table, {
      type: "schema",
      on_failure: "fail",
      columns: [{ name: "order_id", type: "VARCHAR" }],
    });
    assertEquals(finding.status, "fail");
  });

  // ── Null check ────────────────────────────────
  await t.step("null_check: pass", () => {
    const table = createSampleTable();
    const finding = validateNullCheck(table, {
      type: "null_check",
      on_failure: "fail",
      columns: ["order_id", "amount"],
    });
    assertEquals(finding.status, "pass");
  });

  await t.step("null_check: fail with nulls", () => {
    const table = createTableWithNulls();
    const finding = validateNullCheck(table, {
      type: "null_check",
      on_failure: "fail",
      columns: ["order_id", "customer_id"],
    });
    assertEquals(finding.status, "fail");
    const counts = finding.details?.null_counts as Record<string, number>;
    assertEquals(counts["order_id"], 1);
    assertEquals(counts["customer_id"], 1);
  });

  // ── Row count ─────────────────────────────────
  await t.step("row_count: pass", () => {
    const table = createSampleTable();
    const finding = validateRowCount(table, {
      type: "row_count",
      on_failure: "fail",
      columns: [],
      min: 1,
      max: 100,
    });
    assertEquals(finding.status, "pass");
  });

  await t.step("row_count: below min", () => {
    const table = createSampleTable();
    const finding = validateRowCount(table, {
      type: "row_count",
      on_failure: "fail",
      columns: [],
      min: 100,
    });
    assertEquals(finding.status, "fail");
  });

  await t.step("row_count: above max", () => {
    const table = createSampleTable();
    const finding = validateRowCount(table, {
      type: "row_count",
      on_failure: "fail",
      columns: [],
      max: 2,
    });
    assertEquals(finding.status, "fail");
  });

  // ── Custom SQL ────────────────────────────────
  await t.step("custom: pass (no violations)", async () => {
    const table = createSampleTable();
    const finding = await validateCustom(table, {
      type: "custom",
      on_failure: "fail",
      columns: [],
      sql: "SELECT * FROM __result__ WHERE amount < 0",
    });
    assertEquals(finding.status, "pass");
  });

  await t.step("custom: fail (violations found)", async () => {
    const table = createTableWithNegatives();
    const finding = await validateCustom(table, {
      type: "custom",
      on_failure: "fail",
      columns: [],
      sql: "SELECT * FROM __result__ WHERE amount < 0",
    });
    assertEquals(finding.status, "fail");
    assertEquals(finding.details?.violation_count, 1);
  });

  await t.step("custom: no SQL provided", async () => {
    const table = createSampleTable();
    const finding = await validateCustom(table, {
      type: "custom",
      on_failure: "fail",
      columns: [],
    });
    assertEquals(finding.status, "fail");
  });

  // ── Runner ────────────────────────────────────
  await t.step("runner: on_failure=warn downgrades fail to warn", async () => {
    const table = createSampleTable();
    const report = await runValidation(
      table,
      [
        {
          type: "row_count",
          on_failure: "warn",
          columns: [],
          min: 100, // will fail (only 5 rows)
        },
      ],
      "test_pipeline",
    );
    assertEquals(report.findings[0]!.status, "warn");
    assertEquals(report.passed, true); // warn doesn't block
  });

  await t.step("runner: no checks returns empty report", async () => {
    const table = createSampleTable();
    const report = await runValidation(table, [], "test_pipeline");
    assertEquals(report.findings.length, 0);
    assertEquals(report.passed, true);
  });

  // ── Report ────────────────────────────────────
  await t.step("report summary", () => {
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
    assertEquals(report.summary.includes("1 passed"), true);
    assertEquals(report.summary.includes("1 failed"), true);
  });
});
