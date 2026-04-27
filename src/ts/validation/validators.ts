/**
 * Individual validation check implementations.
 */

import type { DataTable, ValidationCheck } from "../models.ts";
import {
  createSession,
  closeSession,
  registerTable,
  querySession,
} from "../normalize/mod.ts";
import type { ValidationFinding } from "./models.ts";

// DuckDB type → accepted YAML type names
const TYPE_MAP: Record<string, string[]> = {
  TINYINT: ["INTEGER", "INT", "SMALLINT", "TINYINT"],
  SMALLINT: ["INTEGER", "INT", "SMALLINT"],
  INTEGER: ["INTEGER", "INT"],
  BIGINT: ["INTEGER", "INT", "BIGINT"],
  UTINYINT: ["INTEGER", "INT"],
  USMALLINT: ["INTEGER", "INT"],
  UINTEGER: ["INTEGER", "INT"],
  UBIGINT: ["INTEGER", "INT", "BIGINT"],
  FLOAT: ["FLOAT", "REAL", "DECIMAL", "NUMERIC", "DOUBLE"],
  DOUBLE: ["FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL"],
  DECIMAL: ["DECIMAL", "NUMERIC"],
  VARCHAR: ["VARCHAR", "TEXT", "STRING", "CHAR"],
  BOOLEAN: ["BOOLEAN", "BOOL"],
  TIMESTAMP: ["TIMESTAMP", "DATETIME"],
  "TIMESTAMP WITH TIME ZONE": ["TIMESTAMP", "DATETIME"],
  DATE: ["DATE"],
  TIME: ["TIME"],
};

function typeMatches(actualType: string, expectedType: string): boolean {
  const expectedUpper = expectedType.toUpperCase();
  const actualUpper = actualType.toUpperCase();

  // Check in type map
  const accepted = TYPE_MAP[actualUpper];
  if (accepted && accepted.includes(expectedUpper)) return true;

  // Fallback: check partial match
  if (actualUpper.includes(expectedUpper) || expectedUpper.includes(actualUpper)) return true;

  return false;
}

export function validateSchema(
  table: DataTable,
  check: ValidationCheck,
): ValidationFinding {
  const actualCols: Record<string, string> = {};
  for (const col of table.columns) {
    actualCols[col.name] = col.type;
  }

  const issues: string[] = [];

  for (const colSpec of check.columns) {
    if (typeof colSpec === "string") {
      if (!(colSpec in actualCols)) {
        issues.push(`Missing column: ${colSpec}`);
      }
    } else {
      if (!(colSpec.name in actualCols)) {
        issues.push(`Missing column: ${colSpec.name}`);
      } else if (!typeMatches(actualCols[colSpec.name]!, colSpec.type)) {
        issues.push(
          `Column '${colSpec.name}': expected ${colSpec.type}, got ${actualCols[colSpec.name]}`,
        );
      }
    }
  }

  if (issues.length > 0) {
    return {
      checkType: "schema",
      status: "fail",
      message: `Schema check failed: ${issues.length} issue(s)`,
      details: { issues, actual_columns: actualCols },
      timestamp: new Date(),
    };
  }

  return {
    checkType: "schema",
    status: "pass",
    message: `Schema check passed: all ${check.columns.length} column(s) match`,
    details: { actual_columns: actualCols },
    timestamp: new Date(),
  };
}

export function validateNullCheck(
  table: DataTable,
  check: ValidationCheck,
): ValidationFinding {
  const nullCounts: Record<string, number> = {};
  const colNames = table.columns.map((c) => c.name);

  for (const colSpec of check.columns) {
    const name = typeof colSpec === "string" ? colSpec : colSpec.name;
    if (!colNames.includes(name)) {
      nullCounts[name] = -1; // column missing
      continue;
    }
    let count = 0;
    for (const row of table.rows) {
      if (row[name] === null || row[name] === undefined) count++;
    }
    if (count > 0) {
      nullCounts[name] = count;
    }
  }

  if (Object.keys(nullCounts).length > 0) {
    const missing = Object.entries(nullCounts)
      .filter(([, n]) => n === -1)
      .map(([c]) => c);
    const withNulls = Object.entries(nullCounts).filter(([, n]) => n > 0);
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(`missing columns: ${missing.join(", ")}`);
    }
    if (withNulls.length > 0) {
      parts.push(withNulls.map(([c, n]) => `${c} (${n} nulls)`).join(", "));
    }
    return {
      checkType: "null_check",
      status: "fail",
      message: `Null check failed: ${parts.join("; ")}`,
      details: { null_counts: nullCounts },
      timestamp: new Date(),
    };
  }

  const names = check.columns.map((c) =>
    typeof c === "string" ? c : c.name
  );
  const scope = names.length > 0 ? names.join(", ") : "all columns";
  return {
    checkType: "null_check",
    status: "pass",
    message: `Null check passed: no nulls in ${scope}`,
    timestamp: new Date(),
  };
}

export function validateRowCount(
  table: DataTable,
  check: ValidationCheck,
): ValidationFinding {
  const actual = table.rows.length;
  const minRows = check.min ?? null;
  const maxRows = check.max ?? null;

  const issues: string[] = [];
  if (minRows !== null && actual < minRows) {
    issues.push(`row count ${actual} is below minimum ${minRows}`);
  }
  if (maxRows !== null && actual > maxRows) {
    issues.push(`row count ${actual} exceeds maximum ${maxRows}`);
  }

  if (issues.length > 0) {
    return {
      checkType: "row_count",
      status: "fail",
      message: `Row count check failed: ${issues.join("; ")}`,
      details: { actual, min: minRows, max: maxRows },
      timestamp: new Date(),
    };
  }

  const rangeText = minRows !== null && maxRows !== null
    ? `${minRows}-${maxRows}`
    : minRows !== null
    ? `>=${minRows}`
    : maxRows !== null
    ? `<=${maxRows}`
    : "unbounded";
  return {
    checkType: "row_count",
    status: "pass",
    message: `Row count check passed: ${actual} rows (range: ${rangeText})`,
    details: { actual, min: minRows, max: maxRows },
    timestamp: new Date(),
  };
}

export async function validateCustom(
  table: DataTable,
  check: ValidationCheck,
): Promise<ValidationFinding> {
  if (!check.sql) {
    return {
      checkType: "custom",
      status: "fail",
      message: "Custom validation failed: no SQL provided",
      timestamp: new Date(),
    };
  }

  try {
    const session = await createSession();

    try {
      // Normalize the result table into DuckDB as "__result__"
      await registerTable(session, "__result__", table);

      const result = await querySession(session, check.sql);
      const violationCount = result.rows.length;

      if (violationCount > 0) {
        const sample = result.rows.slice(0, 5);
        return {
          checkType: "custom",
          status: "fail",
          message: `Custom validation failed: ${violationCount} violating row(s) found`,
          details: { violation_count: violationCount, sample, sql: check.sql },
          timestamp: new Date(),
        };
      }

      return {
        checkType: "custom",
        status: "pass",
        message: "Custom validation passed: no violating rows found",
        details: { sql: check.sql },
        timestamp: new Date(),
      };
    } finally {
      closeSession(session);
    }
  } catch (e) {
    return {
      checkType: "custom",
      status: "fail",
      message: `Custom validation SQL error: ${e}`,
      details: { sql: check.sql, error: String(e) },
      timestamp: new Date(),
    };
  }
}

export type ValidatorFn = (
  table: DataTable,
  check: ValidationCheck,
) => ValidationFinding | Promise<ValidationFinding>;

export const VALIDATORS = new Map<string, ValidatorFn>([
  ["schema", validateSchema],
  ["null_check", validateNullCheck],
  ["row_count", validateRowCount],
  ["custom", validateCustom],
]);
