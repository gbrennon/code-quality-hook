import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type ToolResultHandler = (
  event: { isError: boolean; toolName: string; input: { path: string }; content: [] },
  context: { cwd: string; sessionId: string },
) => Promise<unknown>;

type InstalledHost = {
  commands: Map<string, { handler: (args: string, context: unknown) => Promise<void> }>;
  handlers: Map<string, ToolResultHandler>;
  execCalls: Array<{ command: string; args: string[] }>;
  registerCommand(name: string, command: { handler: (args: string, context: unknown) => Promise<void> }): void;
  on(event: string, handler: ToolResultHandler): void;
  exec(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
  ui: { notify(message: string, type: string): void };
};

const projectRoot = resolve(import.meta.dir, "..");
const temporaryHomes: string[] = [];

function createInstalledHost(): InstalledHost {
  const host: InstalledHost = {
    commands: new Map(),
    handlers: new Map(),
    execCalls: [],
    registerCommand(name, command) {
      host.commands.set(name, command);
    },
    on(event, handler) {
      host.handlers.set(event, handler);
    },
    async exec(command, args) {
      host.execCalls.push({ command, args });
      return { code: 0, stdout: "", stderr: "" };
    },
    ui: { notify() {} },
  };
  return host;
}

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((home) => rm(home, { recursive: true })));
});

describe("installed code-quality hook", () => {
  test("updates both installed hosts before the next Rust write", async () => {
    const home = await mkdtemp(join(tmpdir(), "code-quality-hook-e2e-"));
    temporaryHomes.push(home);
    const installer = Bun.spawn(["bash", join(projectRoot, "scripts/install.sh")], {
      cwd: projectRoot,
      env: { ...process.env, HOME: home },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await installer.exited).toBe(0);

    for (const destination of [
      join(home, ".pi", "agent", "extensions"),
      join(home, ".omp", "agent", "hooks", "post"),
    ]) {
      const module = await import(pathToFileURL(join(destination, "ai-toolkit-quality.ts")).href);
      const host = createInstalledHost();
      module.default(host);
      expect(host.commands.has("code-quality")).toBe(true);
      expect(host.handlers.has("tool_result")).toBe(true);

      await host.commands.get("code-quality")!.handler("set max-complexity 9", {
        ui: host.ui,
      });
      await host.handlers.get("tool_result")!({
        isError: false,
        toolName: "write",
        input: { path: "src/main.rs" },
        content: [],
      }, { cwd: projectRoot, sessionId: "e2e-session" });

      expect(host.execCalls).toHaveLength(1);
      expect(host.execCalls[0]).toMatchObject({
        command: "check-code-quality",
        args: expect.arrayContaining(["-C", "9", "src/main.rs"]),
      });
    }
  });
});
