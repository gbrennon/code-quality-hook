import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const temporaryDirectories: string[] = [];
const projectRoot = resolve(import.meta.dir, "..");
const installerPath = join(projectRoot, "scripts/install.sh");
type InstalledExtensionAPI = {
  readonly commands: Map<string, unknown>;
  readonly events: string[];
  readonly handlers: Map<string, unknown>;
  readonly exec: (...args: unknown[]) => Promise<{ code: number; stdout: string; stderr: string }>;
  readonly ui: { notify: (...args: unknown[]) => void };
  on(event: string, handler: unknown): void;
  registerCommand(name: string, command: unknown): void;
};

function createInstalledExtensionAPI(): InstalledExtensionAPI {
  const commands = new Map<string, unknown>();
  const events: string[] = [];
  const handlers = new Map<string, unknown>();
  return {
    commands,
    events,
    handlers,
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    ui: { notify: () => {} },
    on: (event, handler) => {
      events.push(event);
      handlers.set(event, handler);
    },
    registerCommand: (name, command) => {
      commands.set(name, command);
    },
  };
}



async function installedRuleFiles(destination: string): Promise<string[]> {
  return (await readdir(destination)).filter((file) => file.endsWith(".yml")).sort();
}

async function sourceModuleFiles(): Promise<string[]> {
  return (await readdir(join(projectRoot, "src"))).filter((file) => file.endsWith(".ts")).sort();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("install.sh", () => {
  test("installs source modules and loadable hooks in both destinations", async () => {
    const home = await mkdtemp(join(tmpdir(), "code-quality-hook-home-"));
    temporaryDirectories.push(home);
    const installerProcess = Bun.spawn(["bash", installerPath], {
      env: { ...globalThis.process.env, HOME: home },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(await installerProcess.exited).toBe(0);

    const sourceModules = await sourceModuleFiles();
    const sourceRules = await installedRuleFiles(join(projectRoot, "src", "semgrep-rules"));
    const destinations = [
      join(home, ".pi", "agent", "extensions"),
      join(home, ".omp", "agent", "hooks", "post"),
    ];

    for (const destination of destinations) {
      expect((await readdir(destination)).sort()).toEqual(
        [...sourceModules, "semgrep-rules"].sort(),
      );
      expect(await installedRuleFiles(join(destination, "semgrep-rules"))).toEqual(sourceRules);
      const installedModule = await import(
        pathToFileURL(join(destination, "ai-toolkit-quality.ts")).href,
      );
      expect(typeof installedModule.default).toBe("function");
      const host = createInstalledExtensionAPI();
      installedModule.default(host);
      expect(host.commands.has("code-quality")).toBe(true);
      expect(host.handlers.has("tool_result")).toBe(true);
    }
  });
});
