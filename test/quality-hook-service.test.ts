import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

  test("passes quality limits and fallback Semgrep rules to the checker", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-"));
    temporaryDirectories.push(directory);
    const fallbackRules = join(directory, "hook-rules");
    const calls: Array<{ command: string; args: string[]; options: { cwd: string } }> = [];
    const service = new QualityHookService(
      new CircuitBreakerStore({
        statePath: join(directory, "state.json"),
        threshold: 3,
      }),
      fallbackRules,
    );
    const api = {
      exec: async (command: string, args: string[], options: { cwd: string }) => {
        calls.push({ command, args, options });
        return { code: 1, stdout: "", stderr: "quality failure" };
      },
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
    expect(calls).toEqual([
      {
        command: "check-code-quality",
        args: [
          "-C",
          "5",
          "-L",
          "50",
          "-a",
          "5",
          "--semgrep-config",
          fallbackRules,
          "src/main.py",
        ],
        options: { cwd: directory },
      },
    ]);
  });

  test("passes repository .semgrep rules before fallback rules", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-"));
    temporaryDirectories.push(directory);
    const repositoryRules = join(directory, ".semgrep");
    await mkdir(repositoryRules);
    await writeFile(join(repositoryRules, "rules.yml"), "rules: []");
    const calls: string[][] = [];
    const service = new QualityHookService(
      new CircuitBreakerStore({ statePath: join(directory, "state.json") }),
      join(directory, "hook-rules"),
    );
    const api = {
      exec: async (_command: string, args: string[]) => {
        calls.push(args);
        return { code: 0, stdout: "", stderr: "" };
      },
    };
    const event = {
      toolName: "write",
      input: { path: "src/main.py" },
      content: [],
    };

    await service.processToolResultEvent(api, event, { cwd: directory });

    expect(calls[0]).toContain(repositoryRules);
    expect(calls[0]).not.toContain(join(directory, "hook-rules"));
  });

  test("passes repository semgrep rules before fallback rules", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-"));
    temporaryDirectories.push(directory);
    const repositoryRules = join(directory, "semgrep");
    await mkdir(repositoryRules);
    await writeFile(join(repositoryRules, "rules.yaml"), "rules: []");
    const calls: string[][] = [];
    const service = new QualityHookService(
      new CircuitBreakerStore({ statePath: join(directory, "state.json") }),
      join(directory, "hook-rules"),
    );
    const api = {
      exec: async (_command: string, args: string[]) => {
        calls.push(args);
        return { code: 0, stdout: "", stderr: "" };
      },
    };
    const event = {
      toolName: "write",
      input: { path: "src/main.py" },
      content: [],
    };

    await service.processToolResultEvent(api, event, { cwd: directory });

    expect(calls[0]).toContain(repositoryRules);
    expect(calls[0]).not.toContain(join(directory, "hook-rules"));
  });
