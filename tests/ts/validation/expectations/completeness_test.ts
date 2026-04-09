/**
 * Tests for completeness expectations (null/not-null).
 */

import { assertEquals, assert } from "@std/assert";
import { createSession, closeSession, registerTable } from "../../../../src/ts/normalize/mod.ts";
import { getExpectation } from "../../../../src/ts/validation/expectations/mod.ts";
import { createSampleTable, createTableWithNulls } from "../../fixtures/helpers.ts";

Deno.test("expect_column_values_to_not_be_null: pass on clean data", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_column_values_to_not_be_null")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_not_be_null",
        kwargs: { column: "order_id" },
      },
    );
    assertEquals(result.success, true);
    assertEquals(result.result.unexpected_count, 0);
  } finally { closeSession(session); }
});

Deno.test("expect_column_values_to_not_be_null: fail with nulls", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createTableWithNulls());
    const result = await getExpectation("expect_column_values_to_not_be_null")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_not_be_null",
        kwargs: { column: "order_id" },
      },
    );
    assertEquals(result.success, false);
    assert((result.result.unexpected_count ?? 0) > 0);
  } finally { closeSession(session); }
});

Deno.test("expect_column_values_to_not_be_null: pass with mostly", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createTableWithNulls());
    // 1 null out of 5 rows = 80% not null, mostly=0.7 should pass
    const result = await getExpectation("expect_column_values_to_not_be_null")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_not_be_null",
        kwargs: { column: "order_id", mostly: 0.7 },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_column_values_to_be_null: pass when all null", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", {
      columns: [{ name: "val", type: "VARCHAR" }],
      rows: [{ val: null }, { val: null }],
    });
    const result = await getExpectation("expect_column_values_to_be_null")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_be_null",
        kwargs: { column: "val" },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});
