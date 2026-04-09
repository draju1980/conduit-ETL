/**
 * Table-level expectations — assertions about the table as a whole.
 */

import { querySession } from "../../normalize/mod.ts";
import type { ExpectationResult } from "./types.ts";
import { quoteIdent } from "./types.ts";
import { registerExpectation } from "./registry.ts";
import type { DuckSession } from "../../normalize/mod.ts";

async function getRowCount(session: DuckSession, tableName: string): Promise<number> {
  const r = await querySession(session, `SELECT COUNT(*) AS cnt FROM ${quoteIdent(tableName)}`);
  return Number(r.rows[0]?.cnt ?? 0);
}

async function getColumnNames(session: DuckSession, tableName: string): Promise<string[]> {
  const r = await querySession(session, `DESCRIBE ${quoteIdent(tableName)}`);
  return r.rows.map((row) => String(row.column_name));
}

// ── Row count ────────────────────────────────────────────────────────

registerExpectation(
  "expect_table_row_count_to_equal",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const expected = config.kwargs.value as number;
    const actual = await getRowCount(session, tableName);
    return {
      success: actual === expected,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: { observed_value: actual, element_count: actual },
    };
  },
);

registerExpectation(
  "expect_table_row_count_to_be_between",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const minValue = config.kwargs.min_value as number | undefined;
    const maxValue = config.kwargs.max_value as number | undefined;
    const actual = await getRowCount(session, tableName);
    let success = true;
    if (minValue !== undefined && actual < minValue) success = false;
    if (maxValue !== undefined && actual > maxValue) success = false;
    return {
      success,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: { observed_value: actual, element_count: actual },
    };
  },
);

// ── Column count ─────────────────────────────────────────────────────

registerExpectation(
  "expect_table_column_count_to_equal",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const expected = config.kwargs.value as number;
    const cols = await getColumnNames(session, tableName);
    return {
      success: cols.length === expected,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: { observed_value: cols.length },
    };
  },
);

registerExpectation(
  "expect_table_column_count_to_be_between",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const minValue = config.kwargs.min_value as number | undefined;
    const maxValue = config.kwargs.max_value as number | undefined;
    const cols = await getColumnNames(session, tableName);
    let success = true;
    if (minValue !== undefined && cols.length < minValue) success = false;
    if (maxValue !== undefined && cols.length > maxValue) success = false;
    return {
      success,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: { observed_value: cols.length },
    };
  },
);

// ── Column matching ──────────────────────────────────────────────────

registerExpectation(
  "expect_table_columns_to_match_ordered_list",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const expected = config.kwargs.column_list as string[];
    const actual = await getColumnNames(session, tableName);
    const match = actual.length === expected.length &&
      actual.every((col, i) => col === expected[i]);
    return {
      success: match,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: {
        observed_value: actual.join(", "),
        details: { expected: expected, actual: actual },
      },
    };
  },
);

registerExpectation(
  "expect_table_columns_to_match_set",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const expected = new Set(config.kwargs.column_set as string[]);
    const actual = await getColumnNames(session, tableName);
    const actualSet = new Set(actual);
    const missing = [...expected].filter((c) => !actualSet.has(c));
    const extra = [...actualSet].filter((c) => !expected.has(c));
    return {
      success: missing.length === 0 && extra.length === 0,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: {
        observed_value: actual.join(", "),
        details: { missing, extra },
      },
    };
  },
);
