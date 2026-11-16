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

    expect(resolveSemgrepConfig(directory, "src/main.py", "/hook/semgrep-rules")).toBe(
      repositoryRules,
    );
  });

  test("uses a repository semgrep directory when present", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-"));
    temporaryDirectories.push(directory);
    const repositoryRules = join(directory, "semgrep");
    await mkdir(repositoryRules);
    await writeFile(join(repositoryRules, "rules.yaml"), "rules: []");

    expect(resolveSemgrepConfig(directory, "src/main.py", "/hook/semgrep-rules")).toBe(
      repositoryRules,
    );
  });

  test.each([
    ["Python", "src/main.py", "python.yml"],
    ["Rust", "src/main.rs", "rust.yml"],
    ["Scala", "src/main.scala", "scala.yml"],
  ])("selects bundled %s rules by extension", async (_language, sourcePath, rulesFile) => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-"));
    temporaryDirectories.push(directory);

    expect(resolveSemgrepConfig(directory, sourcePath, "/hook/semgrep-rules")).toBe(
      join("/hook/semgrep-rules", rulesFile),
    );
  });

  test("uses the default bundled rules for an unsupported extension", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-"));
    temporaryDirectories.push(directory);

    expect(resolveSemgrepConfig(directory, "src/main.txt", "/hook/semgrep-rules")).toBe(
      join("/hook/semgrep-rules", "default.yml"),
    );
  });
});
