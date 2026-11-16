import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CircuitBreakerStore } from "../src/circuit-breaker-store.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
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
