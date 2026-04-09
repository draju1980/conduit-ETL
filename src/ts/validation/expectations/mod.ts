/**
 * Expectations module — Great Expectations-style data validation.
 *
 * Importing this module registers all 30 built-in expectations.
 *
 * Categories:
 *   table.ts              — 6 table-level expectations
 *   column_existence.ts   — 3 column existence/type expectations
 *   completeness.ts       — 2 null/completeness expectations
 *   set_membership.ts     — 4 set membership expectations
 *   uniqueness.ts         — 1 uniqueness expectation
 *   numeric.ts            — 3 numeric range/ordering expectations
 *   string.ts             — 4 string/regex/length expectations
 *   aggregate.ts          — 7 aggregate stat expectations
 */

// Import all category files to trigger registration side effects
import "./table.ts";
import "./column_existence.ts";
import "./completeness.ts";
import "./set_membership.ts";
import "./uniqueness.ts";
import "./numeric.ts";
import "./string.ts";
import "./aggregate.ts";

// Re-export public API
export type { ExpectationResult, ExpectationConfig, ExpectationFn } from "./types.ts";
export { evaluateMostly, runColumnMapExpectation, runAggregateExpectation } from "./types.ts";
export { registerExpectation, getExpectation, listExpectations } from "./registry.ts";
