/**
 * Tests for table-level expectations.
 */

import { assertEquals } from "@std/assert";
import { createSession, closeSession, registerTable } from "../../../../src/ts/normalize/mod.ts";
import { getExpectation } from "../../../../src/ts/validation/expectations/mod.ts";
import { createSampleTable } from "../../fixtures/helpers.ts";

Deno.test("expect_table_row_count_to_equal: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_table_row_count_to_equal")!(
      session, "__data__", { expectation_type: "expect_table_row_count_to_equal", kwargs: { value: 5 } },
    );
    assertEquals(result.success, true);
    assertEquals(result.result.observed_value, 5);
  } finally { closeSession(session); }
});

Deno.test("expect_table_row_count_to_equal: fail", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_table_row_count_to_equal")!(
      session, "__data__", { expectation_type: "expect_table_row_count_to_equal", kwargs: { value: 10 } },
    );
    assertEquals(result.success, false);
  } finally { closeSession(session); }
});

Deno.test("expect_table_row_count_to_be_between: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_table_row_count_to_be_between")!(
      session, "__data__", { expectation_type: "expect_table_row_count_to_be_between", kwargs: { min_value: 1, max_value: 100 } },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_table_column_count_to_equal: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_table_column_count_to_equal")!(
      session, "__data__", { expectation_type: "expect_table_column_count_to_equal", kwargs: { value: 5 } },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_table_columns_to_match_set: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_table_columns_to_match_set")!(
      session, "__data__", {
        expectation_type: "expect_table_columns_to_match_set",
        kwargs: { column_set: ["order_id", "customer_id", "amount", "status", "region"] },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_table_columns_to_match_set: fail on missing", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_table_columns_to_match_set")!(
      session, "__data__", {
        expectation_type: "expect_table_columns_to_match_set",
        kwargs: { column_set: ["order_id", "nonexistent"] },
      },
    );
    assertEquals(result.success, false);
  } finally { closeSession(session); }
});

Deno.test("expect_table_columns_to_match_ordered_list: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_table_columns_to_match_ordered_list")!(
      session, "__data__", {
        expectation_type: "expect_table_columns_to_match_ordered_list",
        kwargs: { column_list: ["order_id", "customer_id", "amount", "status", "region"] },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});
