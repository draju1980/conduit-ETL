/**
 * Numeric range and ordering expectations.
 */

import { querySession } from "../../normalize/mod.ts";
import type { ExpectationResult } from "./types.ts";
import { quoteIdent, runColumnMapExpectation, evaluateMostly } from "./types.ts";
import { registerExpectation } from "./registry.ts";

registerExpectation(
  "expect_column_values_to_be_between",
  (session, tableName, config) => {
    const col = quoteIdent(config.kwargs.column as string);
    const minValue = config.kwargs.min_value as number | undefined;
    const maxValue = config.kwargs.max_value as number | undefined;
    const strictMin = (config.kwargs.strict_min as boolean) ?? false;
    const strictMax = (config.kwargs.strict_max as boolean) ?? false;

    const conditions: string[] = [];
    if (minValue !== undefined) {
      conditions.push(strictMin ? `${col} <= ${minValue}` : `${col} < ${minValue}`);
    }
    if (maxValue !== undefined) {
      conditions.push(strictMax ? `${col} >= ${maxValue}` : `${col} > ${maxValue}`);
    }

    const whereClause = conditions.length > 0
      ? conditions.join(" OR ")
      : "FALSE";

    return runColumnMapExpectation(session, tableName, config, whereClause);
  },
);

registerExpectation(
  "expect_column_values_to_be_increasing",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const column = config.kwargs.column as string;
    const mostly = (config.kwargs.mostly as number) ?? 1.0;
    const strictlyIncreasing = (config.kwargs.strictly as boolean) ?? false;
    const col = quoteIdent(column);
    const tbl = quoteIdent(tableName);

    const op = strictlyIncreasing ? "<=" : "<";

    const r = await querySession(session, `
      SELECT
        COUNT(*) AS element_count,
        COUNT(*) FILTER (WHERE ${col} IS NULL) AS missing_count,
        COUNT(*) FILTER (WHERE prev IS NOT NULL AND ${col} IS NOT NULL AND ${col} ${op} prev) AS unexpected_count
      FROM (
        SELECT ${col}, LAG(${col}) OVER () AS prev FROM ${tbl}
      )
    `);

    const elementCount = Number(r.rows[0]?.element_count ?? 0);
    const missingCount = Number(r.rows[0]?.missing_count ?? 0);
    const unexpectedCount = Number(r.rows[0]?.unexpected_count ?? 0);
    const evaluation = evaluateMostly(elementCount, missingCount, unexpectedCount, mostly);

    return {
      success: evaluation.success,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: {
        observed_value: `${unexpectedCount} non-increasing values`,
        element_count: elementCount,
        unexpected_count: unexpectedCount,
        unexpected_percent: evaluation.unexpectedPercent,
        missing_count: missingCount,
        missing_percent: evaluation.missingPercent,
      },
    };
  },
);

registerExpectation(
  "expect_column_values_to_be_decreasing",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const column = config.kwargs.column as string;
    const mostly = (config.kwargs.mostly as number) ?? 1.0;
    const strictlyDecreasing = (config.kwargs.strictly as boolean) ?? false;
    const col = quoteIdent(column);
    const tbl = quoteIdent(tableName);

    const op = strictlyDecreasing ? ">=" : ">";

    const r = await querySession(session, `
      SELECT
        COUNT(*) AS element_count,
        COUNT(*) FILTER (WHERE ${col} IS NULL) AS missing_count,
        COUNT(*) FILTER (WHERE prev IS NOT NULL AND ${col} IS NOT NULL AND ${col} ${op} prev) AS unexpected_count
      FROM (
        SELECT ${col}, LAG(${col}) OVER () AS prev FROM ${tbl}
      )
    `);

    const elementCount = Number(r.rows[0]?.element_count ?? 0);
    const missingCount = Number(r.rows[0]?.missing_count ?? 0);
    const unexpectedCount = Number(r.rows[0]?.unexpected_count ?? 0);
    const evaluation = evaluateMostly(elementCount, missingCount, unexpectedCount, mostly);

    return {
      success: evaluation.success,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: {
        observed_value: `${unexpectedCount} non-decreasing values`,
        element_count: elementCount,
        unexpected_count: unexpectedCount,
        unexpected_percent: evaluation.unexpectedPercent,
        missing_count: missingCount,
        missing_percent: evaluation.missingPercent,
      },
    };
  },
);
