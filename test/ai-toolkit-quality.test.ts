import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CircuitBreakerStore,
  isSourceCodePath,
  QualityHookService,
} from "../src/ai-toolkit-quality.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("isSourceCodePath", () => {
  test("accepts supported source and Markdown extensions", () => {
    expect(isSourceCodePath("src/main.py")).toBe(true);
    expect(isSourceCodePath("docs/guide.MARKDOWN")).toBe(true);
  });

  test("rejects unsupported paths", () => {
    expect(isSourceCodePath("image.png")).toBe(false);
    expect(isSourceCodePath("Makefile")).toBe(false);
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

    expect(store.isOpen("session", directory, "src/main.py")).toBe(false);
    expect(store.recordFailure("session", directory, "src/main.py")).toBe(1);
    expect(store.recordFailure("session", directory, "src/main.py")).toBe(2);
    expect(store.isOpen("session", directory, "src/main.py")).toBe(true);
  });

  test("resets failures for a path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-"));
    temporaryDirectories.push(directory);
    const store = new CircuitBreakerStore({
      statePath: join(directory, "state.json"),
      threshold: 1,
    });

    store.recordFailure("session", directory, "src/main.py");
    store.reset("session", directory, "src/main.py");

    expect(store.isOpen("session", directory, "src/main.py")).toBe(false);
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

    const result = await service.handleToolResult(api, event, {
      cwd: directory,
      sessionId: "session",
    });

    expect(result?.content.at(-1)?.text).toContain("quality failure");
  });
});
