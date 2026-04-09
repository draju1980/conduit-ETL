/**
 * Zod schemas for pipeline.yaml configuration.
 * Replaces Python Pydantic models.
 */

import { z } from "zod";

// ── Pipeline metadata ───────────────────────────────────────────────

export const PipelineMetadataSchema = z.object({
  name: z.string(),
  version: z.string().nullish(),
  description: z.string().nullish(),
  schedule: z.string().nullish(),
  tags: z.array(z.string()).default([]),
});
export type PipelineMetadata = z.infer<typeof PipelineMetadataSchema>;

// ── Schema lock / Time machine ──────────────────────────────────────

export const SchemaLockConfigSchema = z.object({
  enabled: z.boolean().default(false),
  on_violation: z.enum(["block", "warn"]).default("warn"),
  track: z.array(z.string()).default(["columns", "types", "nullability"]),
});
export type SchemaLockConfig = z.infer<typeof SchemaLockConfigSchema>;

export const TimeMachineConfigSchema = z.object({
  schema_lock: SchemaLockConfigSchema.default({}),
});
export type TimeMachineConfig = z.infer<typeof TimeMachineConfigSchema>;

// ── Source configuration ────────────────────────────────────────────

export const IncrementalConfigSchema = z.object({
  enabled: z.boolean().default(false),
  strategy: z.enum(["timestamp", "id"]).default("timestamp"),
  watermark_column: z.string().nullish(),
});
export type IncrementalConfig = z.infer<typeof IncrementalConfigSchema>;

export const SourceConfigSchema = z.object({
  name: z.string(),
  type: z.string(),
  connection: z.string().nullish(),
  config: z.record(z.unknown()).default({}),
  query: z.string().nullish(),
  incremental: IncrementalConfigSchema.default({}),
  time_machine: TimeMachineConfigSchema.default({}),
});
export type SourceConfig = z.infer<typeof SourceConfigSchema>;

// ── Transform ───────────────────────────────────────────────────────

export const TransformConfigSchema = z.object({
  engine: z.string().default("duckdb"),
  sql: z.string(),
});
export type TransformConfig = z.infer<typeof TransformConfigSchema>;

// ── Validation ──────────────────────────────────────────────────────

export const SchemaColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
});
export type SchemaColumn = z.infer<typeof SchemaColumnSchema>;

export const ValidationCheckSchema = z.object({
  type: z.enum(["schema", "null_check", "row_count", "custom"]),
  on_failure: z.enum(["fail", "warn"]).default("fail"),
  columns: z.array(z.union([SchemaColumnSchema, z.string()])).default([]),
  min: z.number().int().nullish(),
  max: z.number().int().nullish(),
  sql: z.string().nullish(),
});
export type ValidationCheck = z.infer<typeof ValidationCheckSchema>;

// ── Expectation check (GE-style) ────────────────────────────────────

export const ExpectationCheckSchema = z.object({
  expectation_type: z.string(),
  kwargs: z.record(z.unknown()).default({}),
  on_failure: z.enum(["fail", "warn"]).default("fail"),
});
export type ExpectationCheck = z.infer<typeof ExpectationCheckSchema>;

/** Union of old-style ValidationCheck and new GE-style ExpectationCheck. */
export const ValidationItemSchema = z.union([
  ValidationCheckSchema,
  ExpectationCheckSchema,
]);
export type ValidationItem = z.infer<typeof ValidationItemSchema>;

// ── Destination ─────────────────────────────────────────────────────

export const IncrementalDestConfigSchema = z.object({
  merge_key: z.array(z.string()).default([]),
  strategy: z.enum(["merge", "append"]).default("append"),
});
export type IncrementalDestConfig = z.infer<typeof IncrementalDestConfigSchema>;

export const DestinationConfigSchema = z.object({
  name: z.string(),
  type: z.string(),
  connection: z.string().nullish(),
  mode: z.enum(["full_refresh", "incremental"]).default("full_refresh"),
  batch_size: z.number().int().default(5000),
  config: z.record(z.unknown()).default({}),
  incremental: IncrementalDestConfigSchema.default({}),
  time_machine: TimeMachineConfigSchema.default({}),
});
export type DestinationConfig = z.infer<typeof DestinationConfigSchema>;

// ── Runtime ─────────────────────────────────────────────────────────

export const DiskCheckConfigSchema = z.object({
  enabled: z.boolean().default(true),
  min_free_gb: z.number().int().default(5),
  safety_buffer_pct: z.number().int().default(20),
  on_failure: z.enum(["block", "warn"]).default("block"),
});
export type DiskCheckConfig = z.infer<typeof DiskCheckConfigSchema>;

export const ChunkingConfigSchema = z.object({
  extract_chunk_size: z.number().int().default(10000),
  load_batch_size: z.number().int().default(5000),
  max_memory_mb: z.number().int().default(512),
  spill_to_disk: z.boolean().default(true),
});
export type ChunkingConfig = z.infer<typeof ChunkingConfigSchema>;

export const CheckpointConfigSchema = z.object({
  enabled: z.boolean().default(true),
  auto_resume: z.boolean().default(true),
  retention: z.number().int().default(7),
  path: z.string().default(".conduit/checkpoints/"),
});
export type CheckpointConfig = z.infer<typeof CheckpointConfigSchema>;

export const RuntimeConfigSchema = z.object({
  disk_check: DiskCheckConfigSchema.default({}),
  chunking: ChunkingConfigSchema.default({}),
  checkpoint: CheckpointConfigSchema.default({}),
});
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

// ── Error handling ──────────────────────────────────────────────────

export const ErrorHandlingConfigSchema = z.object({
  max_retries: z.number().int().default(3),
  retry_delay_seconds: z.number().int().default(30),
  retry_backoff: z.enum(["linear", "exponential"]).default("exponential"),
  on_failure: z.enum(["abort", "skip_batch", "dead_letter"]).default("abort"),
  dead_letter_path: z.string().nullish(),
});
export type ErrorHandlingConfig = z.infer<typeof ErrorHandlingConfigSchema>;

// ── Top-level pipeline config ───────────────────────────────────────

export const PipelineConfigSchema = z.object({
  pipeline: PipelineMetadataSchema,
  sources: z.array(SourceConfigSchema).default([]),
  transform: TransformConfigSchema,
  validation: z.array(ValidationItemSchema).default([]),
  destinations: z.array(DestinationConfigSchema).default([]),
  runtime: RuntimeConfigSchema.default({}),
  error_handling: ErrorHandlingConfigSchema.default({}),
});
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

// ── Data table representation ───────────────────────────────────────

export interface ColumnInfo {
  name: string;
  type: string; // DuckDB SQL type: INTEGER, VARCHAR, DOUBLE, etc.
}

export interface DataTable {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
}
