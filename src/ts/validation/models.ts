/**
 * Validation result models.
 */

export interface ValidationFinding {
  checkType: string;
  status: "pass" | "fail" | "warn";
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

export class ValidationReport {
  pipelineName: string;
  runTimestamp: Date;
  findings: ValidationFinding[] = [];

  constructor(pipelineName: string) {
    this.pipelineName = pipelineName;
    this.runTimestamp = new Date();
  }

  get passed(): boolean {
    return this.findings.every((f) => f.status !== "fail");
  }

  get summary(): string {
    const total = this.findings.length;
    const passed = this.findings.filter((f) => f.status === "pass").length;
    const warned = this.findings.filter((f) => f.status === "warn").length;
    const failed = this.findings.filter((f) => f.status === "fail").length;

    const parts: string[] = [`${total} check(s):`];
    if (passed > 0) parts.push(`${passed} passed`);
    if (warned > 0) parts.push(`${warned} warned`);
    if (failed > 0) parts.push(`${failed} failed`);
    return parts.join(", ");
  }

  toJSON(): Record<string, unknown> {
    return {
      pipeline_name: this.pipelineName,
      run_timestamp: this.runTimestamp.toISOString(),
      summary: this.summary,
      passed: this.passed,
      findings: this.findings.map((f) => ({
        check_type: f.checkType,
        status: f.status,
        message: f.message,
        details: f.details ?? null,
        timestamp: f.timestamp.toISOString(),
      })),
    };
  }
}
