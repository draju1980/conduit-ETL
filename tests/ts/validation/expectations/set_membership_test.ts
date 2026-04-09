/**
 * Tests for set membership expectations.
 */

import { assertEquals, assert } from "@std/assert";
import { createSession, closeSession, registerTable } from "../../../../src/ts/normalize/mod.ts";
import { getExpectation } from "../../../../src/ts/validation/expectations/mod.ts";
import { createSampleTable } from "../../fixtures/helpers.ts";

Deno.test("expect_column_values_to_be_in_set: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_column_values_to_be_in_set")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_be_in_set",
        kwargs: { column: "status", value_set: ["active", "completed"] },
      },
    );
    assertEquals(result.success, true);
    assertEquals(result.result.unexpected_count, 0);
  } finally { closeSession(session); }
});

Deno.test("expect_column_values_to_be_in_set: fail", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_column_values_to_be_in_set")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_be_in_set",
        kwargs: { column: "status", value_set: ["active"] },
      },
    );
    assertEquals(result.success, false);
    assert((result.result.unexpected_count ?? 0) > 0);
    assert((result.result.partial_unexpected_list ?? []).length > 0);
  } finally { closeSession(session); }
});

Deno.test("expect_column_values_to_be_in_set: pass with mostly", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    // 4 active + 1 completed. value_set=["active"] means 1 unexpected out of 5 = 80% pass
    const result = await getExpectation("expect_column_values_to_be_in_set")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_be_in_set",
        kwargs: { column: "status", value_set: ["active"], mostly: 0.7 },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_column_values_to_not_be_in_set: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_column_values_to_not_be_in_set")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_not_be_in_set",
        kwargs: { column: "status", value_set: ["cancelled", "deleted"] },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_column_distinct_values_to_contain_set: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_column_distinct_values_to_contain_set")!(
      session, "__data__", {
        expectation_type: "expect_column_distinct_values_to_contain_set",
        kwargs: { column: "status", value_set: ["active"] },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_column_distinct_values_to_equal_set: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_column_distinct_values_to_equal_set")!(
      session, "__data__", {
        expectation_type: "expect_column_distinct_values_to_equal_set",
        kwargs: { column: "status", value_set: ["active", "completed"] },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});
