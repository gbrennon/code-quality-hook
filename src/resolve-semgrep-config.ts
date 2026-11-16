import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SEMGREP_CONFIG_CANDIDATES = [
  ".semgrep",
  "semgrep",
  ".semgrep.yml",
  ".semgrep.yaml",
  "semgrep.yml",
  "semgrep.yaml",
] as const;

const BUNDLED_RULES_BY_EXTENSION: Readonly<Record<string, string>> = {
  py: "python.yml",
  pyw: "python.yml",
  rs: "rust.yml",
  scala: "scala.yml",
  sc: "scala.yml",
  go: "go.yml",
  java: "java.yml",
  kt: "kotlin.yml",
  kts: "kotlin.yml",
  hs: "haskell.yml",
  lhs: "haskell.yml",
  ts: "typescript.yml",
  tsx: "typescript.yml",
  js: "javascript.yml",
  jsx: "javascript.yml",
  mjs: "javascript.yml",
  cjs: "javascript.yml",
  swift: "swift.yml",
  cs: "csharp.yml",
  c: "cpp.yml",
  h: "cpp.yml",
  cc: "cpp.yml",
  cpp: "cpp.yml",
  hpp: "cpp.yml",
  cxx: "cpp.yml",
  rb: "ruby.yml",
  php: "php.yml",
  lua: "lua.yml",
  sh: "bash.yml",
};

export function resolveSemgrepConfig(
  cwd: string,
  sourcePath: string,
  fallbackRulesPath: string,
): string {
  for (const candidate of SEMGREP_CONFIG_CANDIDATES) {
    const candidatePath = join(cwd, candidate);
    if (containsSemgrepRules(candidatePath)) return candidatePath;
  }

  const extensionStart = sourcePath.lastIndexOf(".");
  const extension = extensionStart >= 0 ? sourcePath.slice(extensionStart + 1).toLowerCase() : "";
  const bundledRulesFile = BUNDLED_RULES_BY_EXTENSION[extension] || "default.yml";
  return join(fallbackRulesPath, bundledRulesFile);
}

function containsSemgrepRules(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    return inspectSemgrepPath(path);
  } catch {
    return false;
  }
}

function inspectSemgrepPath(path: string): boolean {
  const stats = statSync(path);
  if (stats.isFile()) return path.endsWith(".yml") || path.endsWith(".yaml");
  if (stats.isDirectory()) return directoryContainsSemgrepRules(path);
  return false;
}

function directoryContainsSemgrepRules(path: string): boolean {
  return readdirSync(path, { withFileTypes: true }).some((entry) =>
    containsSemgrepRules(join(path, entry.name)),
  );
}
