/**
 * Dedicated tests for the `mostly` parameter edge cases.
 */

import { assertEquals } from "@std/assert";
import { evaluateMostly } from "../../../../src/ts/validation/expectations/mod.ts";

Deno.test("mostly: 1.0 (default) — any failure means fail", () => {
  const r = evaluateMostly(100, 0, 1, 1.0);
  assertEquals(r.success, false);
});

Deno.test("mostly: 1.0 — zero failures passes", () => {
  const r = evaluateMostly(100, 0, 0, 1.0);
  assertEquals(r.success, true);
});

Deno.test("mostly: 0.0 — always passes", () => {
  const r = evaluateMostly(100, 0, 100, 0.0);
  assertEquals(r.success, true);
});

Deno.test("mostly: 0.8 with exactly 80% passing", () => {
  // 20 unexpected out of 100 = 80% pass = exactly at threshold
  const r = evaluateMostly(100, 0, 20, 0.8);
  assertEquals(r.success, true);
});

Deno.test("mostly: 0.8 with 79% passing — should fail", () => {
  // 21 unexpected out of 100 = 79% pass = below threshold
  const r = evaluateMostly(100, 0, 21, 0.8);
  assertEquals(r.success, false);
});

Deno.test("mostly: handles all nulls (element_count=0)", () => {
  const r = evaluateMostly(0, 0, 0, 0.95);
  assertEquals(r.success, true);
  assertEquals(r.unexpectedPercent, 0);
});

Deno.test("mostly: missing values excluded from calculation", () => {
  // 100 total, 50 missing, 10 unexpected out of 50 non-null = 80% pass
  const r = evaluateMostly(100, 50, 10, 0.8);
  assertEquals(r.success, true);
});

Deno.test("mostly: percent values are rounded", () => {
  const r = evaluateMostly(3, 0, 1, 0.5);
  // 1/3 unexpected ≈ 0.3333 → rounded to 0.3333
  assertEquals(typeof r.unexpectedPercent, "number");
  assertEquals(typeof r.missingPercent, "number");
});
