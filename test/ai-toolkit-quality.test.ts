import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as qualityHookEntrypoint from "../src/ai-toolkit-quality.ts";
import {
  CircuitBreakerStore,
  checkSourceCodePath,
  QualityHookService,
} from "../src/ai-toolkit-quality.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("checkSourceCodePath", () => {
  test("accepts supported source and Markdown extensions", () => {
    expect(checkSourceCodePath("src/main.py")).toBe(true);
    expect(checkSourceCodePath("docs/guide.MARKDOWN")).toBe(true);
  });

  test("rejects unsupported paths", () => {
    expect(checkSourceCodePath("image.png")).toBe(false);
    expect(checkSourceCodePath("Makefile")).toBe(false);
  });

  test("re-exports the renamed predicate from the entrypoint", () => {
    expect(qualityHookEntrypoint.checkSourceCodePath).toBe(checkSourceCodePath);
  });
});

describe("CircuitBreakerStore", () => {
  test("opens after the configured number of failures", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-"));
    temporaryDirectories.push(directory);
    const store = new CircuitBreakerStore({
      statePath: join(directory, "state.json"),
      threshold: 2,
    });

    expect(store.checkCircuitBreakerIsOpen("session", directory, "src/main.py")).toBe(false);
    expect(store.recordCircuitBreakerFailure("session", directory, "src/main.py")).toBe(1);
    expect(store.recordCircuitBreakerFailure("session", directory, "src/main.py")).toBe(2);
    expect(store.checkCircuitBreakerIsOpen("session", directory, "src/main.py")).toBe(true);
  });

  test("resets failures for a path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-"));
    temporaryDirectories.push(directory);
    const store = new CircuitBreakerStore({
      statePath: join(directory, "state.json"),
      threshold: 1,
    });

    store.recordCircuitBreakerFailure("session", directory, "src/main.py");
    store.resetCircuitBreakerFailures("session", directory, "src/main.py");

    expect(store.checkCircuitBreakerIsOpen("session", directory, "src/main.py")).toBe(false);
  });
});

describe("QualityHookService", () => {
  test("appends quality diagnostics after an edit fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-"));
    temporaryDirectories.push(directory);
    const service = new QualityHookService(
      new CircuitBreakerStore({
        statePath: join(directory, "state.json"),
        threshold: 3,
      }),
    );
    const api = {
      exec: async () => ({ code: 1, stdout: "", stderr: "quality failure" }),
    };
    const event = {
      isError: false,
      toolName: "write",
      input: { path: "src/main.py" },
      content: [{ type: "text", text: "write complete" }],
    };

    const result = await service.processToolResultEvent(api, event, {
      cwd: directory,
      sessionId: "session",
    });

    expect(result?.content.at(-1)?.text).toContain("quality failure");
  });
});
