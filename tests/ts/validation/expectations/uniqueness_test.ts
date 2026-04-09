/**
 * Tests for uniqueness expectations.
 */

import { assertEquals, assert } from "@std/assert";
import { createSession, closeSession, registerTable } from "../../../../src/ts/normalize/mod.ts";
import { getExpectation } from "../../../../src/ts/validation/expectations/mod.ts";
import { createSampleTable } from "../../fixtures/helpers.ts";

Deno.test("expect_column_values_to_be_unique: pass", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    const result = await getExpectation("expect_column_values_to_be_unique")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_be_unique",
        kwargs: { column: "order_id" },
      },
    );
    assertEquals(result.success, true);
    assertEquals(result.result.unexpected_count, 0);
  } finally { closeSession(session); }
});

Deno.test("expect_column_values_to_be_unique: fail on duplicates", async () => {
  const session = await createSession();
  try {
    await registerTable(session, "__data__", createSampleTable());
    // status has duplicates ("active" appears 4 times)
    const result = await getExpectation("expect_column_values_to_be_unique")!(
      session, "__data__", {
        expectation_type: "expect_column_values_to_be_unique",
        kwargs: { column: "status" },
      },
    );
    assertEquals(result.success, false);
    assert((result.result.unexpected_count ?? 0) > 0);
    assert((result.result.partial_unexpected_list ?? []).length > 0);
  } finally { closeSession(session); }
});
