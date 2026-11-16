import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CircuitBreakerStore } from "../src/circuit-breaker-store.ts";
import { QualityHookService } from "../src/quality-hook-service.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
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
