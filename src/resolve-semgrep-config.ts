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

export function resolveSemgrepConfig(cwd: string, fallbackRulesPath: string): string {
  for (const candidate of SEMGREP_CONFIG_CANDIDATES) {
    const candidatePath = join(cwd, candidate);
    if (containsSemgrepRules(candidatePath)) return candidatePath;
  }
  return fallbackRulesPath;
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

