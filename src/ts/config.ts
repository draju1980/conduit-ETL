/**
 * Pipeline configuration loader.
 * Parses YAML and validates with Zod schemas.
 */

import { parse as parseYaml } from "@std/yaml";
import { PipelineConfigSchema } from "./models.ts";
import type { PipelineConfig } from "./models.ts";

export function loadPipeline(path: string): PipelineConfig {
  const text = Deno.readTextFileSync(path);
  const raw = parseYaml(text);
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Invalid pipeline config: expected YAML mapping`);
  }
  return PipelineConfigSchema.parse(raw);
}
