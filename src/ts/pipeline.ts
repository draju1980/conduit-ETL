/**
 * Pipeline runner — orchestrates Extract -> Transform -> Validate -> Load.
 */

import { dirname, resolve, join } from "@std/path";
import { loadPipeline } from "./config.ts";
import { extractSources } from "./engine/extract.ts";
import { runTransform } from "./engine/transform.ts";
import { runValidation } from "./validation/runner.ts";
import { logFindings, saveReport } from "./validation/reporter.ts";
import { LOADERS } from "./loader/mod.ts";

export async function runPipeline(
  configPath: string,
  validateOnly = false,
): Promise<boolean> {
  const configFile = resolve(configPath);
  const baseDir = dirname(configFile);
  const reportsDir = join(baseDir, ".conduit", "reports");

  const config = loadPipeline(configFile);
  const pipelineName = config.pipeline.name;
  console.log("=".repeat(60));
  console.log(`Pipeline '${pipelineName}' — starting`);
  console.log("=".repeat(60));

  // --- Step 1: Extract ---
  console.log("--- EXTRACT ---");
  const sources = extractSources(config.sources, baseDir);

  // --- Step 2: Transform ---
  console.log("--- TRANSFORM ---");
  const result = await runTransform(config.transform.sql, sources);

  // --- Step 3: Validate ---
  console.log("--- VALIDATE ---");
  const report = await runValidation(result, config.validation, pipelineName);

  logFindings(report);
  saveReport(report, reportsDir);

  if (!report.passed) {
    console.error(
      `Pipeline '${pipelineName}' STOPPED — validation failed. Load will NOT proceed.`,
    );
    return false;
  }

  if (validateOnly) {
    console.log("Validation-only mode — skipping load step");
    return true;
  }

  // --- Step 4: Load ---
  console.log("--- LOAD ---");
  for (const dest of config.destinations) {
    const loader = LOADERS.get(dest.type);
    if (!loader) {
      throw new Error(
        `Destination type '${dest.type}' is not yet implemented. ` +
          `Supported types: ${[...LOADERS.keys()].sort().join(", ")}`,
      );
    }
    await loader(result, dest, baseDir);
  }

  console.log("=".repeat(60));
  console.log(`Pipeline '${pipelineName}' — completed successfully`);
  console.log("=".repeat(60));
  return true;
}
