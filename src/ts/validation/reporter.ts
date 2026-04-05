/**
 * Log validation findings and save reports to disk.
 */

import { join } from "@std/path";
import type { ValidationReport } from "./models.ts";

const STATUS_SYMBOL: Record<string, string> = {
  pass: "\u2713",
  warn: "\u26a0",
  fail: "\u2717",
};

export function logFindings(report: ValidationReport): void {
  for (const finding of report.findings) {
    const symbol = STATUS_SYMBOL[finding.status] ?? "?";
    const logFn = finding.status === "fail"
      ? console.error
      : finding.status === "warn"
      ? console.warn
      : console.log;

    logFn(`[${symbol}] ${finding.checkType}: ${finding.message}`);

    if (finding.details && (finding.status === "fail" || finding.status === "warn")) {
      for (const [key, value] of Object.entries(finding.details)) {
        if (key === "sample") continue;
        logFn(`    ${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  if (report.passed) {
    console.log(`Validation summary: ${report.summary} — PASSED`);
  } else {
    console.error(
      `Validation summary: ${report.summary} — FAILED (load will be blocked)`,
    );
  }
}

export function saveReport(report: ValidationReport, outputDir: string): string {
  Deno.mkdirSync(outputDir, { recursive: true });

  const ts = report.runTimestamp.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${report.pipelineName}_${ts}.json`;
  const reportPath = join(outputDir, filename);

  Deno.writeTextFileSync(reportPath, JSON.stringify(report.toJSON(), null, 2));
  console.log(`Validation report saved to ${reportPath}`);
  return reportPath;
}
