/**
 * Core types and shared helpers for the expectations system.
 *
 * Every expectation is a function that receives a DuckDB session
 * (with data already registered as a table) and returns an
 * ExpectationResult with rich diagnostics.
 */

import type { DuckSession } from "../../normalize/mod.ts";
import { querySession } from "../../normalize/mod.ts";

// ── Result types ─────────────────────────────────────────────────────

/** Rich result modeled after Great Expectations. */
export interface ExpectationResult {
  success: boolean;
  expectation_type: string;
  kwargs: Record<string, unknown>;
  result: {
    observed_value: string | number | boolean | null;
    element_count?: number;
    unexpected_count?: number;
    unexpected_percent?: number;
    missing_count?: number;
    missing_percent?: number;
    partial_unexpected_list?: unknown[];
    details?: Record<string, unknown>;
  };
}

/** Config passed to every expectation function. */
export interface ExpectationConfig {
  expectation_type: string;
  kwargs: Record<string, unknown>;
}

/** The function signature every expectation must implement. */
export type ExpectationFn = (
  session: DuckSession,
  tableName: string,
  config: ExpectationConfig,
) => Promise<ExpectationResult>;

// ── mostly helper ────────────────────────────────────────────────────

/**
 * Evaluate whether a column-map expectation passes given the `mostly` threshold.
 *
 * `mostly` (0.0–1.0, default 1.0) specifies the minimum fraction of
 * non-null values that must satisfy the expectation. For example,
 * mostly=0.95 means up to 5% unexpected values are tolerated.
 */
export function evaluateMostly(
  elementCount: number,
  missingCount: number,
  unexpectedCount: number,
  mostly = 1.0,
): { success: boolean; unexpectedPercent: number; missingPercent: number } {
  const nonnullCount = elementCount - missingCount;
  const unexpectedPercent = nonnullCount > 0
    ? unexpectedCount / nonnullCount
    : 0;
  const missingPercent = elementCount > 0
    ? missingCount / elementCount
    : 0;
  // Use rounded values for comparison to avoid floating point edge cases
  const roundedUnexpected = Math.round(unexpectedPercent * 10000) / 10000;
  const threshold = Math.round((1.0 - mostly) * 10000) / 10000;
  return {
    success: roundedUnexpected <= threshold,
    unexpectedPercent: roundedUnexpected,
    missingPercent: Math.round(missingPercent * 10000) / 10000,
  };
}

// ── SQL safety ───────────────────────────────────────────────────────

/** Escape a string value for safe SQL interpolation. */
export function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Quote a column name for DuckDB. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ── Column-map helper ────────────────────────────────────────────────

/**
 * Shared pattern for column-map expectations.
 *
 * Most column-level expectations follow the same flow:
 * 1. Run a count query to get element_count, missing_count, unexpected_count
 * 2. Evaluate against `mostly` threshold
 * 3. Optionally fetch a sample of unexpected values
 *
 * @param session      - DuckDB session with table registered
 * @param tableName    - Name of the registered table
 * @param config       - Expectation config (must have kwargs.column)
 * @param whereClause  - SQL condition that identifies UNEXPECTED rows
 *                       (applied to non-null rows only)
 */
export async function runColumnMapExpectation(
  session: DuckSession,
  tableName: string,
  config: ExpectationConfig,
  whereClause: string,
): Promise<ExpectationResult> {
  const column = config.kwargs.column as string;
  const mostly = (config.kwargs.mostly as number) ?? 1.0;
  const col = quoteIdent(column);
  const tbl = quoteIdent(tableName);

  // Count query
  const countSql = `
    SELECT
      COUNT(*) AS element_count,
      COUNT(*) FILTER (WHERE ${col} IS NULL) AS missing_count,
      COUNT(*) FILTER (WHERE ${col} IS NOT NULL AND (${whereClause})) AS unexpected_count
    FROM ${tbl}
  `;
  const countResult = await querySession(session, countSql);
  const row = countResult.rows[0]!;
  const elementCount = Number(row.element_count);
  const missingCount = Number(row.missing_count);
  const unexpectedCount = Number(row.unexpected_count);

  const evaluation = evaluateMostly(elementCount, missingCount, unexpectedCount, mostly);

  // Sample query (only if failures exist)
  let partialUnexpectedList: unknown[] = [];
  if (unexpectedCount > 0) {
    const sampleSql = `
      SELECT ${col} FROM ${tbl}
      WHERE ${col} IS NOT NULL AND (${whereClause})
      LIMIT 20
    `;
    const sampleResult = await querySession(session, sampleSql);
    partialUnexpectedList = sampleResult.rows.map((r) => r[column]);
  }

  return {
    success: evaluation.success,
    expectation_type: config.expectation_type,
    kwargs: config.kwargs,
    result: {
      observed_value: `${100 - evaluation.unexpectedPercent * 100}% match`,
      element_count: elementCount,
      unexpected_count: unexpectedCount,
      unexpected_percent: evaluation.unexpectedPercent,
      missing_count: missingCount,
      missing_percent: evaluation.missingPercent,
      partial_unexpected_list: partialUnexpectedList,
    },
  };
}

// ── Aggregate helper ─────────────────────────────────────────────────

/**
 * Shared pattern for column aggregate expectations (min, max, mean, etc.).
 *
 * Runs a single aggregate SQL, checks the result against min/max bounds.
 */
export async function runAggregateExpectation(
  session: DuckSession,
  tableName: string,
  config: ExpectationConfig,
  sqlAgg: string,
): Promise<ExpectationResult> {
  const column = config.kwargs.column as string;
  const minValue = config.kwargs.min_value as number | undefined;
  const maxValue = config.kwargs.max_value as number | undefined;
  const col = quoteIdent(column);
  const tbl = quoteIdent(tableName);

  const sql = `SELECT ${sqlAgg}(${col}) AS agg_value FROM ${tbl}`;
  const result = await querySession(session, sql);
  const observed = Number(result.rows[0]?.agg_value ?? 0);

  let success = true;
  if (minValue !== undefined && observed < minValue) success = false;
  if (maxValue !== undefined && observed > maxValue) success = false;

  return {
    success,
    expectation_type: config.expectation_type,
    kwargs: config.kwargs,
    result: {
      observed_value: observed,
      details: { min_value: minValue, max_value: maxValue },
    },
  };
}
