/**
 * Tests for validation/validators.ts — individual check implementations.
 *
 * Covers all 4 validator types: schema, null_check, row_count, custom.
 */

import { assertEquals } from "@std/assert";
import {
  validateSchema,
  validateNullCheck,
  validateRowCount,
  validateCustom,
} from "../../../src/ts/validation/validators.ts";
import {
  createSampleTable,
  createTableWithNulls,
  createTableWithNegatives,
} from "../fixtures/helpers.ts";

// ── Schema validator ──────────────────────────

Deno.test("schema: pass when columns match", () => {
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

Deno.test("schema: fail on missing column", () => {
  const table = createSampleTable();
  const finding = validateSchema(table, {
    type: "schema",
    on_failure: "fail",
    columns: [{ name: "nonexistent", type: "INTEGER" }],
  });
  assertEquals(finding.status, "fail");
});

Deno.test("schema: fail on wrong type", () => {
  const table = createSampleTable();
  const finding = validateSchema(table, {
    type: "schema",
    on_failure: "fail",
    columns: [{ name: "order_id", type: "VARCHAR" }],
  });
  assertEquals(finding.status, "fail");
});

// ── Null check validator ──────────────────────

Deno.test("null_check: pass when no nulls", () => {
  const table = createSampleTable();
  const finding = validateNullCheck(table, {
    type: "null_check",
    on_failure: "fail",
    columns: ["order_id", "amount"],
  });
  assertEquals(finding.status, "pass");
});

Deno.test("null_check: fail with nulls", () => {
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

// ── Row count validator ───────────────────────

Deno.test("row_count: pass within range", () => {
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

Deno.test("row_count: fail below min", () => {
  const table = createSampleTable();
  const finding = validateRowCount(table, {
    type: "row_count",
    on_failure: "fail",
    columns: [],
    min: 100,
  });
  assertEquals(finding.status, "fail");
});

Deno.test("row_count: fail above max", () => {
  const table = createSampleTable();
  const finding = validateRowCount(table, {
    type: "row_count",
    on_failure: "fail",
    columns: [],
    max: 2,
  });
  assertEquals(finding.status, "fail");
});

// ── Custom SQL validator ──────────────────────

Deno.test("custom: pass when no violations", async () => {
  const table = createSampleTable();
  const finding = await validateCustom(table, {
    type: "custom",
    on_failure: "fail",
    columns: [],
    sql: "SELECT * FROM __result__ WHERE amount < 0",
  });
  assertEquals(finding.status, "pass");
});

Deno.test("custom: fail when violations found", async () => {
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

Deno.test("custom: fail when no SQL provided", async () => {
  const table = createSampleTable();
  const finding = await validateCustom(table, {
    type: "custom",
    on_failure: "fail",
    columns: [],
  });
  assertEquals(finding.status, "fail");
});
