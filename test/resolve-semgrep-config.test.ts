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

const bundledRuleCases = [
    ["Python", "src/main.py", "python.yml"],
    ["Python alias", "src/main.pyw", "python.yml"],
    ["Rust", "src/main.rs", "rust.yml"],
    ["Scala", "src/main.scala", "scala.yml"],
    ["Scala alias", "src/main.sc", "scala.yml"],
    ["Go", "src/main.go", "go.yml"],
    ["Java", "src/Main.java", "java.yml"],
    ["Kotlin", "src/Main.kt", "kotlin.yml"],
    ["Kotlin alias", "src/Main.kts", "kotlin.yml"],
    ["Haskell", "src/Main.hs", "haskell.yml"],
    ["Haskell alias", "src/Main.lhs", "haskell.yml"],
    ["TypeScript", "src/main.ts", "typescript.yml"],
    ["TypeScript alias", "src/main.tsx", "typescript.yml"],
    ["JavaScript", "src/main.js", "javascript.yml"],
    ["JavaScript JSX alias", "src/main.jsx", "javascript.yml"],
    ["JavaScript module alias", "src/main.mjs", "javascript.yml"],
    ["JavaScript commonjs alias", "src/main.cjs", "javascript.yml"],
    ["Swift", "Sources/Main.swift", "swift.yml"],
    ["C#", "src/Main.cs", "csharp.yml"],
    ["C", "src/main.c", "cpp.yml"],
    ["C header alias", "src/main.h", "cpp.yml"],
    ["C++", "src/main.cpp", "cpp.yml"],
    ["C++ header alias", "src/main.hpp", "cpp.yml"],
    ["C++ alias", "src/main.cxx", "cpp.yml"],
    ["Ruby", "src/main.rb", "ruby.yml"],
    ["PHP", "src/main.php", "php.yml"],
    ["Lua", "src/main.lua", "lua.yml"],
    ["Bash", "scripts/main.sh", "bash.yml"],
];
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

  test.each(bundledRuleCases)("selects bundled %s rules by extension", async (_language, sourcePath, rulesFile) => {
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
