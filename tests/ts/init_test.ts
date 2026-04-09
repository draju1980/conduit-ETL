/**
 * Tests for `conduit init` — project scaffolding.
 */

import { assertEquals, assert } from "@std/assert";
import { join } from "@std/path";
import { existsSync } from "@std/fs";
import { initProject } from "../../src/ts/init.ts";

Deno.test("init creates project structure in empty directory", () => {
  const tmp = Deno.makeTempDirSync();
  try {
    const result = initProject(tmp);

    // Should create .conduit and subdirectories
    assert(existsSync(join(tmp, ".conduit")));
    assert(existsSync(join(tmp, ".conduit", "reports")));
    assert(existsSync(join(tmp, ".conduit", "logs")));
    assert(existsSync(join(tmp, ".conduit", "scheduler")));
    assert(existsSync(join(tmp, ".conduit", "checkpoints")));

    // Should create sample pipeline.yaml
    assert(existsSync(join(tmp, "pipeline.yaml")));
    const yaml = Deno.readTextFileSync(join(tmp, "pipeline.yaml"));
    assert(yaml.includes("pipeline:"));
    assert(yaml.includes("name: my_pipeline"));

    // Should create data/ and output/ directories
    assert(existsSync(join(tmp, "data")));
    assert(existsSync(join(tmp, "output")));

    // All items should be in created list
    assert(result.created.length > 0);
    assertEquals(result.skipped.length, 0);
  } finally {
    Deno.removeSync(tmp, { recursive: true });
  }
});

Deno.test("init skips existing files and directories", () => {
  const tmp = Deno.makeTempDirSync();
  try {
    // First init
    initProject(tmp);

    // Second init — everything should be skipped
    const result = initProject(tmp);

    assertEquals(result.created.length, 0);
    assert(result.skipped.length > 0);
  } finally {
    Deno.removeSync(tmp, { recursive: true });
  }
});

Deno.test("init does not overwrite existing pipeline.yaml", () => {
  const tmp = Deno.makeTempDirSync();
  try {
    const pipelinePath = join(tmp, "pipeline.yaml");
    Deno.writeTextFileSync(pipelinePath, "custom: content\n");

    initProject(tmp);

    // Original content should be preserved
    const content = Deno.readTextFileSync(pipelinePath);
    assertEquals(content, "custom: content\n");
  } finally {
    Deno.removeSync(tmp, { recursive: true });
  }
});
