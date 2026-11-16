import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSemgrepConfig } from "../src/resolve-semgrep-config.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("resolveSemgrepConfig", () => {
  test("prefers a repository .semgrep directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-"));
    temporaryDirectories.push(directory);
    const repositoryRules = join(directory, ".semgrep");
    await mkdir(repositoryRules);
    await writeFile(join(repositoryRules, "rules.yml"), "rules: []");

    expect(resolveSemgrepConfig(directory, "/hook/semgrep-rules")).toBe(repositoryRules);
  });

  test("uses a repository semgrep directory when present", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-"));
    temporaryDirectories.push(directory);
    const repositoryRules = join(directory, "semgrep");
    await mkdir(repositoryRules);
    await writeFile(join(repositoryRules, "rules.yaml"), "rules: []");

    expect(resolveSemgrepConfig(directory, "/hook/semgrep-rules")).toBe(repositoryRules);
  });

  test("falls back to the hook rules when the repository has no config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-"));
    temporaryDirectories.push(directory);

    expect(resolveSemgrepConfig(directory, "/hook/semgrep-rules")).toBe(
      "/hook/semgrep-rules",
    );
  });
});
