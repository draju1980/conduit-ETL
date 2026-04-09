/**
 * Tests for aggregate stat expectations.
 */

import { assertEquals } from "@std/assert";
import { createSession, closeSession, registerTable } from "../../../../src/ts/normalize/mod.ts";
import { getExpectation } from "../../../../src/ts/validation/expectations/mod.ts";
import { createSampleTable } from "../../fixtures/helpers.ts";

Deno.test("expect_column_min_to_be_between: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_column_min_to_be_between")!(
      session, "__data__", {
        expectation_type: "expect_column_min_to_be_between",
        kwargs: { column: "amount", min_value: 0, max_value: 100 },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_column_max_to_be_between: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_column_max_to_be_between")!(
      session, "__data__", {
        expectation_type: "expect_column_max_to_be_between",
        kwargs: { column: "amount", min_value: 1000, max_value: 2000 },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_column_mean_to_be_between: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    // amounts: 250, 175.5, 500, 89.99, 1200 → mean ≈ 443
    const result = await getExpectation("expect_column_mean_to_be_between")!(
      session, "__data__", {
        expectation_type: "expect_column_mean_to_be_between",
        kwargs: { column: "amount", min_value: 400, max_value: 500 },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_column_mean_to_be_between: fail", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_column_mean_to_be_between")!(
      session, "__data__", {
        expectation_type: "expect_column_mean_to_be_between",
        kwargs: { column: "amount", min_value: 1000, max_value: 2000 },
      },
    );
    assertEquals(result.success, false);
  } finally { closeSession(session); }
});

Deno.test("expect_column_sum_to_be_between: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    // sum ≈ 2215.49
    const result = await getExpectation("expect_column_sum_to_be_between")!(
      session, "__data__", {
        expectation_type: "expect_column_sum_to_be_between",
        kwargs: { column: "amount", min_value: 2000, max_value: 2500 },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_column_unique_value_count_to_be_between: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    // status has 2 distinct values: active, completed
    const result = await getExpectation("expect_column_unique_value_count_to_be_between")!(
      session, "__data__", {
        expectation_type: "expect_column_unique_value_count_to_be_between",
        kwargs: { column: "status", min_value: 1, max_value: 5 },
      },
    );
    assertEquals(result.success, true);
    assertEquals(result.result.observed_value, 2);
  } finally { closeSession(session); }
});
