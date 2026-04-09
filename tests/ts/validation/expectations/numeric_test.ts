/**
 * Tests for numeric expectations.
 */

import { assertEquals, assert } from "@std/assert";
import { createSession, closeSession, registerTable } from "../../../../src/ts/normalize/mod.ts";
import { getExpectation } from "../../../../src/ts/validation/expectations/mod.ts";
import { createSampleTable } from "../../fixtures/helpers.ts";
import type { DataTable } from "../../../../src/ts/models.ts";

Deno.test("expect_column_values_to_be_between: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_column_values_to_be_between")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_be_between",
        kwargs: { column: "amount", min_value: 0, max_value: 2000 },
      },
    );
    assertEquals(result.success, true);
    assertEquals(result.result.unexpected_count, 0);
  } finally { closeSession(session); }
});

Deno.test("expect_column_values_to_be_between: fail", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    // max_value=500 but we have 1200.0
    const result = await getExpectation("expect_column_values_to_be_between")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_be_between",
        kwargs: { column: "amount", min_value: 0, max_value: 500 },
      },
    );
    assertEquals(result.success, false);
    assert((result.result.unexpected_count ?? 0) > 0);
  } finally { closeSession(session); }
});

Deno.test("expect_column_values_to_be_increasing: pass", async () => {
  const session = await createSession();
  try {
    const table: DataTable = {
      columns: [{ name: "val", type: "INTEGER" }],
      rows: [{ val: 1 }, { val: 2 }, { val: 3 }, { val: 5 }],
    };
    await registerTable(session, "__data__", table);
    const result = await getExpectation("expect_column_values_to_be_increasing")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_be_increasing",
        kwargs: { column: "val" },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_column_values_to_be_decreasing: pass", async () => {
  const session = await createSession();
  try {
    const table: DataTable = {
      columns: [{ name: "val", type: "INTEGER" }],
      rows: [{ val: 10 }, { val: 7 }, { val: 3 }, { val: 1 }],
    };
    await registerTable(session, "__data__", table);
    const result = await getExpectation("expect_column_values_to_be_decreasing")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_be_decreasing",
        kwargs: { column: "val" },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});
