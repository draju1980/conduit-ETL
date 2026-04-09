/**
 * Validation orchestrator — runs both legacy checks and GE-style expectations.
 *
 * Dispatches based on the presence of `expectation_type` (new) vs `type` (legacy).
 * New-style expectations share a single DuckDB session for performance.
 */

import type { DataTable, ValidationCheck, ValidationItem } from "../models.ts";
import type { ValidationFinding } from "./models.ts";
import { ValidationReport } from "./models.ts";
import { VALIDATORS } from "./validators.ts";
import {
  createSession,
  closeSession,
  registerTable,
} from "../normalize/mod.ts";
import { getExpectation } from "./expectations/mod.ts";
import type { ExpectationResult } from "./expectations/mod.ts";

/** Type guard: does this item have the legacy `type` field? */
function isLegacyCheck(item: ValidationItem): item is ValidationCheck {
  return "type" in item && typeof (item as Record<string, unknown>).type === "string" &&
    !("expectation_type" in item);
}

/** Convert an ExpectationResult to a ValidationFinding for the report. */
function expectationToFinding(
  result: ExpectationResult,
  onFailure: "fail" | "warn",
): ValidationFinding {
  let status: "pass" | "fail" | "warn";
  if (result.success) {
    status = "pass";
  } else {
    status = onFailure === "warn" ? "warn" : "fail";
  }

  return {
    checkType: result.expectation_type,
    status,
    message: formatExpectationMessage(result),
    details: {
      ...result.result,
      kwargs: result.kwargs,
    },
    timestamp: new Date(),
  };
}

function formatExpectationMessage(result: ExpectationResult): string {
  const name = result.expectation_type;
  if (result.success) {
    return `${name}: passed (observed: ${result.result.observed_value})`;
  }
  const parts = [`${name}: failed (observed: ${result.result.observed_value})`];
  if (result.result.unexpected_count !== undefined) {
    parts.push(`${result.result.unexpected_count} unexpected`);
  }
  return parts.join(", ");
}

export async function runValidation(
  table: DataTable,
  checks: ValidationItem[],
  pipelineName: string,
): Promise<ValidationReport> {
  const report = new ValidationReport(pipelineName);

  if (checks.length === 0) {
    console.log("No validation checks defined — skipping validation");
    return report;
  }

  console.log(
    `Running ${checks.length} validation check(s) for pipeline '${pipelineName}'`,
  );

  // Separate legacy checks from new expectations
  const legacyChecks: ValidationCheck[] = [];
  const expectations: { expectation_type: string; kwargs: Record<string, unknown>; on_failure: "fail" | "warn" }[] = [];

  for (const item of checks) {
    if (isLegacyCheck(item)) {
      legacyChecks.push(item);
    } else {
      const exp = item as { expectation_type: string; kwargs: Record<string, unknown>; on_failure?: "fail" | "warn" };
      expectations.push({
        expectation_type: exp.expectation_type,
        kwargs: exp.kwargs ?? {},
        on_failure: exp.on_failure ?? "fail",
      });
    }
  }

  // Run legacy checks (unchanged behavior)
  for (const check of legacyChecks) {
    let finding: ValidationFinding;

    const validator = VALIDATORS.get(check.type);
    if (!validator) {
      finding = {
        checkType: check.type,
        status: "fail",
        message: `Unknown validation type: '${check.type}'`,
        timestamp: new Date(),
      };
    } else {
      finding = await validator(table, check);
    }

    // Apply on_failure policy
    if (finding.status === "fail" && check.on_failure === "warn") {
      finding = { ...finding, status: "warn" };
    }

    report.findings.push(finding);
  }

  // Run GE-style expectations (shared DuckDB session)
  if (expectations.length > 0) {
    const session = await createSession();
    try {
      await registerTable(session, "__data__", table);

      for (const exp of expectations) {
        const fn = getExpectation(exp.expectation_type);
        if (!fn) {
          report.findings.push({
            checkType: exp.expectation_type,
            status: "fail",
            message: `Unknown expectation type: '${exp.expectation_type}'`,
            timestamp: new Date(),
          });
          continue;
        }

        const result = await fn(session, "__data__", {
          expectation_type: exp.expectation_type,
          kwargs: exp.kwargs,
        });
        report.findings.push(expectationToFinding(result, exp.on_failure));
      }
    } finally {
      closeSession(session);
    }
  }

  return report;
}
