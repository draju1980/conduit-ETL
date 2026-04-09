/**
 * Conduit ETL — public API exports.
 *
 * @module
 */

export { runPipeline } from "./src/ts/pipeline.ts";
export { loadPipeline } from "./src/ts/config.ts";
export { extractSources } from "./src/ts/engine/extract.ts";
export { runTransform } from "./src/ts/engine/transform.ts";
export {
  createSession,
  closeSession,
  registerTable,
  registerSources,
  querySession,
} from "./src/ts/normalize/mod.ts";
export type { DuckSession } from "./src/ts/normalize/mod.ts";
export { runValidation } from "./src/ts/validation/runner.ts";
export { LOADERS } from "./src/ts/loader/mod.ts";
export type {
  DataTable,
  ColumnInfo,
  PipelineConfig,
  SourceConfig,
  DestinationConfig,
  ValidationCheck,
} from "./src/ts/models.ts";
