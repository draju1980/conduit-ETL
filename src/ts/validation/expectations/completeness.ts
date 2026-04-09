/**
 * Completeness expectations — null/not-null checks with `mostly` support.
 */

import { querySession } from "../../normalize/mod.ts";
import type { ExpectationResult } from "./types.ts";
import { quoteIdent, evaluateMostly } from "./types.ts";
import { registerExpectation } from "./registry.ts";

registerExpectation(
  "expect_column_values_to_not_be_null",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const column = config.kwargs.column as string;
    const mostly = (config.kwargs.mostly as number) ?? 1.0;
    const col = quoteIdent(column);
    const tbl = quoteIdent(tableName);

    const r = await querySession(session, `
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE ${col} IS NULL) AS nulls
      FROM ${tbl}
    `);
    const total = Number(r.rows[0]?.total ?? 0);
    const nulls = Number(r.rows[0]?.nulls ?? 0);

    // For not-be-null: unexpected = null rows, missing = 0 (nulls ARE the failures)
    const evaluation = evaluateMostly(total, 0, nulls, mostly);

    return {
      success: evaluation.success,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: {
        observed_value: `${((total - nulls) / Math.max(total, 1) * 100).toFixed(2)}% not null`,
        element_count: total,
        unexpected_count: nulls,
        unexpected_percent: evaluation.unexpectedPercent,
        missing_count: nulls,
        missing_percent: evaluation.missingPercent,
      },
    };
  },
);

registerExpectation(
  "expect_column_values_to_be_null",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const column = config.kwargs.column as string;
    const mostly = (config.kwargs.mostly as number) ?? 1.0;
    const col = quoteIdent(column);
    const tbl = quoteIdent(tableName);

    const r = await querySession(session, `
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE ${col} IS NOT NULL) AS non_nulls
      FROM ${tbl}
    `);
    const total = Number(r.rows[0]?.total ?? 0);
    const nonNulls = Number(r.rows[0]?.non_nulls ?? 0);

    // For be-null: unexpected = non-null rows
    const evaluation = evaluateMostly(total, 0, nonNulls, mostly);

    return {
      success: evaluation.success,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: {
        observed_value: `${((total - nonNulls) / Math.max(total, 1) * 100).toFixed(2)}% null`,
        element_count: total,
        unexpected_count: nonNulls,
        unexpected_percent: evaluation.unexpectedPercent,
      },
    };
  },
);
