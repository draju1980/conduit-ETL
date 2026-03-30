"""Pydantic models for pipeline.yaml configuration."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class PipelineMetadata(BaseModel):
    name: str
    version: str | None = None
    description: str | None = None
    schedule: str | None = None
    tags: list[str] = Field(default_factory=list)


class SchemaLockConfig(BaseModel):
    enabled: bool = False
    on_violation: Literal["block", "warn"] = "warn"
    track: list[str] = Field(default_factory=lambda: ["columns", "types", "nullability"])


class TimeMachineConfig(BaseModel):
    schema_lock: SchemaLockConfig = Field(default_factory=SchemaLockConfig)


class IncrementalConfig(BaseModel):
    enabled: bool = False
    strategy: Literal["timestamp", "id"] = "timestamp"
    watermark_column: str | None = None


class SourceConfig(BaseModel):
    name: str
    type: str
    connection: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    query: str | None = None
    incremental: IncrementalConfig = Field(default_factory=IncrementalConfig)
    time_machine: TimeMachineConfig = Field(default_factory=TimeMachineConfig)


class TransformConfig(BaseModel):
    engine: str = "duckdb"
    sql: str


class SchemaColumn(BaseModel):
    name: str
    type: str


class ValidationCheck(BaseModel):
    type: Literal["schema", "null_check", "row_count", "custom"]
    on_failure: Literal["fail", "warn"] = "fail"
    columns: list[SchemaColumn | str] = Field(default_factory=list)
    min: int | None = None
    max: int | None = None
    sql: str | None = None


class IncrementalDestConfig(BaseModel):
    merge_key: list[str] = Field(default_factory=list)
    strategy: Literal["merge", "append"] = "append"


class DestinationConfig(BaseModel):
    name: str
    type: str
    connection: str | None = None
    mode: Literal["full_refresh", "incremental"] = "full_refresh"
    batch_size: int = 5000
    config: dict[str, Any] = Field(default_factory=dict)
    incremental: IncrementalDestConfig = Field(default_factory=IncrementalDestConfig)
    time_machine: TimeMachineConfig = Field(default_factory=TimeMachineConfig)


class DiskCheckConfig(BaseModel):
    enabled: bool = True
    min_free_gb: int = 5
    safety_buffer_pct: int = 20
    on_failure: Literal["block", "warn"] = "block"


class ChunkingConfig(BaseModel):
    extract_chunk_size: int = 10000
    load_batch_size: int = 5000
    max_memory_mb: int = 512
    spill_to_disk: bool = True


class CheckpointConfig(BaseModel):
    enabled: bool = True
    auto_resume: bool = True
    retention: int = 7
    path: str = ".conduit/checkpoints/"


class RuntimeConfig(BaseModel):
    disk_check: DiskCheckConfig = Field(default_factory=DiskCheckConfig)
    chunking: ChunkingConfig = Field(default_factory=ChunkingConfig)
    checkpoint: CheckpointConfig = Field(default_factory=CheckpointConfig)


class ErrorHandlingConfig(BaseModel):
    max_retries: int = 3
    retry_delay_seconds: int = 30
    retry_backoff: Literal["linear", "exponential"] = "exponential"
    on_failure: Literal["abort", "skip_batch", "dead_letter"] = "abort"
    dead_letter_path: str | None = None


class PipelineConfig(BaseModel):
    pipeline: PipelineMetadata
    sources: list[SourceConfig] = Field(default_factory=list)
    transform: TransformConfig
    validation: list[ValidationCheck] = Field(default_factory=list)
    destinations: list[DestinationConfig] = Field(default_factory=list)
    runtime: RuntimeConfig = Field(default_factory=RuntimeConfig)
    error_handling: ErrorHandlingConfig = Field(default_factory=ErrorHandlingConfig)
