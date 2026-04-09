/**
 * Uniqueness expectations.
 */

import { querySession } from "../../normalize/mod.ts";
import type { ExpectationResult } from "./types.ts";
import { quoteIdent, evaluateMostly } from "./types.ts";
import { registerExpectation } from "./registry.ts";

registerExpectation(
  "expect_column_values_to_be_unique",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const column = config.kwargs.column as string;
    const mostly = (config.kwargs.mostly as number) ?? 1.0;
    const col = quoteIdent(column);
    const tbl = quoteIdent(tableName);

    // Count total and nulls
    const countR = await querySession(session, `
      SELECT
        COUNT(*) AS element_count,
        COUNT(*) FILTER (WHERE ${col} IS NULL) AS missing_count
      FROM ${tbl}
    `);
    const elementCount = Number(countR.rows[0]?.element_count ?? 0);
    const missingCount = Number(countR.rows[0]?.missing_count ?? 0);

    // Count duplicate (non-unique) values
    const dupR = await querySession(session, `
      SELECT SUM(n - 1) AS dup_count FROM (
        SELECT ${col}, COUNT(*) AS n FROM ${tbl}
        WHERE ${col} IS NOT NULL
        GROUP BY ${col}
        HAVING COUNT(*) > 1
      )
    `);
    const unexpectedCount = Number(dupR.rows[0]?.dup_count ?? 0);

    const evaluation = evaluateMostly(elementCount, missingCount, unexpectedCount, mostly);

    // Sample duplicates
    let partialUnexpectedList: unknown[] = [];
    if (unexpectedCount > 0) {
      const sampleR = await querySession(session, `
        SELECT ${col} FROM ${tbl}
        WHERE ${col} IS NOT NULL
        GROUP BY ${col} HAVING COUNT(*) > 1
        LIMIT 20
      `);
      partialUnexpectedList = sampleR.rows.map((r) => r[column]);
    }

    return {
      success: evaluation.success,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: {
        observed_value: `${unexpectedCount} duplicate values`,
        element_count: elementCount,
        unexpected_count: unexpectedCount,
        unexpected_percent: evaluation.unexpectedPercent,
        missing_count: missingCount,
        missing_percent: evaluation.missingPercent,
        partial_unexpected_list: partialUnexpectedList,
      },
    };
  },
);
