import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const temporaryDirectories: string[] = [];
const projectRoot = resolve(import.meta.dir, "..");
const installerPath = join(projectRoot, "scripts/install.sh");

async function installedRuleFiles(destination: string): Promise<string[]> {
  return (await readdir(destination)).filter((file) => file.endsWith(".yml")).sort();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("install.sh", () => {
  test("installs every bundled Semgrep rule in both hook destinations", async () => {
    const home = await mkdtemp(join(tmpdir(), "code-quality-hook-home-"));
    temporaryDirectories.push(home);
    const installerProcess = Bun.spawn(["bash", installerPath], {
      env: { ...globalThis.process.env, HOME: home },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(await installerProcess.exited).toBe(0);

    const sourceRules = await installedRuleFiles(join(projectRoot, "src", "semgrep-rules"));
    const destinations = [
      join(home, ".pi", "agent", "extensions"),
      join(home, ".omp", "agent", "hooks", "post"),
    ];

    for (const destination of destinations) {
      expect(await installedRuleFiles(destination)).toEqual(sourceRules);
      expect(await Bun.file(join(destination, "ai-toolkit-quality.ts")).exists()).toBe(true);
    }
  });
});
