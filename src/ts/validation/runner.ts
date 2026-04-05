/**
 * Validation orchestrator — runs all checks and produces a report.
 */

import type { DataTable, ValidationCheck } from "../models.ts";
import type { ValidationFinding } from "./models.ts";
import { ValidationReport } from "./models.ts";
import { VALIDATORS } from "./validators.ts";

export async function runValidation(
  table: DataTable,
  checks: ValidationCheck[],
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

  for (let i = 0; i < checks.length; i++) {
    const check = checks[i]!;
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

  return report;
}
