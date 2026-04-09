/**
 * Tests for string pattern/length expectations.
 */

import { assertEquals, assert } from "@std/assert";
import { createSession, closeSession, registerTable } from "../../../../src/ts/normalize/mod.ts";
import { getExpectation } from "../../../../src/ts/validation/expectations/mod.ts";
import { createSampleTable } from "../../fixtures/helpers.ts";
import type { DataTable } from "../../../../src/ts/models.ts";

Deno.test("expect_column_values_to_match_regex: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    // All status values are lowercase alpha
    const result = await getExpectation("expect_column_values_to_match_regex")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_match_regex",
        kwargs: { column: "status", regex: "^[a-z]+$" },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_column_values_to_match_regex: fail", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    // Looking for digits only — status is alpha
    const result = await getExpectation("expect_column_values_to_match_regex")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_match_regex",
        kwargs: { column: "status", regex: "^[0-9]+$" },
      },
    );
    assertEquals(result.success, false);
    assert((result.result.unexpected_count ?? 0) > 0);
  } finally { closeSession(session); }
});

Deno.test("expect_column_values_to_not_match_regex: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_column_values_to_not_match_regex")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_not_match_regex",
        kwargs: { column: "status", regex: "^[0-9]+$" },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_column_value_lengths_to_equal: pass", async () => {
  const session = await createSession();
  try {
    const table: DataTable = {
      columns: [{ name: "code", type: "VARCHAR" }],
      rows: [{ code: "ABC" }, { code: "DEF" }, { code: "GHI" }],
    };
    await registerTable(session, "__data__", table);
    const result = await getExpectation("expect_column_value_lengths_to_equal")!(
      session, "__data__", {
        expectation_type: "expect_column_value_lengths_to_equal",
        kwargs: { column: "code", value: 3 },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});

Deno.test("expect_column_value_lengths_to_be_between: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    // "active" = 6, "completed" = 9
    const result = await getExpectation("expect_column_value_lengths_to_be_between")!(
      session, "__data__", {
        expectation_type: "expect_column_value_lengths_to_be_between",
        kwargs: { column: "status", min_value: 5, max_value: 10 },
      },
    );
    assertEquals(result.success, true);
  } finally { closeSession(session); }
});
