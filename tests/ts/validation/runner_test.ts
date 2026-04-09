/**
 * Tests for validation/runner.ts — validation orchestrator.
 */

import { assertEquals } from "@std/assert";
import { runValidation } from "../../../src/ts/validation/runner.ts";
import { createSampleTable } from "../fixtures/helpers.ts";

Deno.test("runner: on_failure=warn downgrades fail to warn", async () => {
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

Deno.test("runner: no checks returns empty report", async () => {
  const table = createSampleTable();
  const report = await runValidation(table, [], "test_pipeline");
  assertEquals(report.findings.length, 0);
  assertEquals(report.passed, true);
});
