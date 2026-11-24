import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface QualitySettings {
  maxComplexity: number;
  maxFunctionLength: number;
  maxArguments: number;
  circuitBreakerThreshold: number;
  circuitBreakerStatePath?: string;
}

export type QualitySettingKey =
  | "max-complexity"
  | "max-function-length"
  | "max-arguments"
  | "circuit-breaker-threshold"
  | "circuit-breaker-state-path";

export interface QualitySettingsStoreOptions {
  configPath?: string;
}

export const DEFAULT_QUALITY_SETTINGS: QualitySettings = {
  maxComplexity: 5,
  maxFunctionLength: 50,
  maxArguments: 5,
  circuitBreakerThreshold: 3,
};

const QUALITY_SETTING_KEYS: readonly QualitySettingKey[] = [
  "max-complexity",
  "max-function-length",
  "max-arguments",
  "circuit-breaker-threshold",
  "circuit-breaker-state-path",
];
const EXPECTED_QUALITY_SETTING_KEYS = QUALITY_SETTING_KEYS.join(", ");

type QualitySettingOverrides = Record<string, unknown>;

export function isQualitySettingKey(value: string): value is QualitySettingKey {
  return QUALITY_SETTING_KEYS.includes(value as QualitySettingKey);
}

export class QualitySettingsStore {
  private readonly configPath: string;

  public constructor(options: QualitySettingsStoreOptions = {}) {
    const configPath =
      options.configPath ??
      join(
        process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
        "ai-toolkit",
        "code-quality-hook.json",
      );
    this.configPath = resolve(configPath);
  }

  public getConfigPath(): string {
    return this.configPath;
  }

  public load(): QualitySettings {
    const overrides = this.readOverrides();
    const statePath = this.resolveStatePath(overrides["circuit-breaker-state-path"]);
    const settings: QualitySettings = {
      maxComplexity: this.resolveNumericSetting(
        overrides["max-complexity"],
        DEFAULT_QUALITY_SETTINGS.maxComplexity,
      ),
      maxFunctionLength: this.resolveNumericSetting(
        overrides["max-function-length"],
        DEFAULT_QUALITY_SETTINGS.maxFunctionLength,
      ),
      maxArguments: this.resolveNumericSetting(
        overrides["max-arguments"],
        DEFAULT_QUALITY_SETTINGS.maxArguments,
      ),
      circuitBreakerThreshold: this.resolveNumericSetting(
        overrides["circuit-breaker-threshold"],
        this.resolveEnvironmentThreshold(),
      ),
    };
    if (statePath !== undefined) settings.circuitBreakerStatePath = statePath;
    return settings;
  }

  public saveSetting(key: QualitySettingKey, rawValue: string): QualitySettings {
    const value = this.validateSettingValue(key, rawValue);
    const overrides = this.readOverrides();
    overrides[key] = value;
    this.writeOverrides(overrides);
    return this.load();
  }

  public reset(key?: QualitySettingKey): QualitySettings {
    if (key !== undefined && !isQualitySettingKey(key)) {
      throw new Error(
        `Unknown quality setting "${key}": expected one of ${EXPECTED_QUALITY_SETTING_KEYS}.`,
      );
    }

    const overrides = this.readOverrides();
    if (key === undefined) {
      for (const settingKey of QUALITY_SETTING_KEYS) delete overrides[settingKey];
    } else {
      delete overrides[key];
    }

    if (Object.keys(overrides).length === 0) {
      this.deleteConfigFile();
    } else {
      this.writeOverrides(overrides);
    }
    return this.load();
  }

  private readOverrides(): QualitySettingOverrides {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.configPath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const overrides: QualitySettingOverrides = {};
      for (const [key, value] of Object.entries(parsed)) overrides[key] = value;
      return overrides;
    } catch {
      return {};
    }
  }

  private resolveNumericSetting(value: unknown, fallback: number): number {
    return this.isValidNumericValue(value) ? value : fallback;
  }

  private resolveEnvironmentThreshold(): number {
    const environmentValue =
      process.env.AI_TOOLKIT_CIRCUIT_BREAKER_THRESHOLD ||
      String(DEFAULT_QUALITY_SETTINGS.circuitBreakerThreshold);
    const configured = Number.parseInt(environmentValue, 10);
    return this.isValidNumericValue(configured)
      ? configured
      : DEFAULT_QUALITY_SETTINGS.circuitBreakerThreshold;
  }

  private resolveStatePath(value: unknown): string | undefined {
    if (this.isValidStatePath(value)) return value;
    const environmentPath = process.env.AI_TOOLKIT_CIRCUIT_BREAKER_STATE;
    return environmentPath || undefined;
  }

  private validateSettingValue(key: QualitySettingKey, rawValue: string): number | string {
    if (!isQualitySettingKey(key)) {
      throw new Error(
        `Unknown quality setting "${key}": expected one of ${EXPECTED_QUALITY_SETTING_KEYS}.`,
      );
    }
    if (key === "circuit-breaker-state-path") {
      if (typeof rawValue === "string" && rawValue.trim().length > 0) return rawValue;
      throw new Error(
        `Invalid setting "${key}": expected a non-blank state path.`,
      );
    }

    if (typeof rawValue === "string" && /^\d+$/.test(rawValue)) {
      const value = Number(rawValue);
      if (this.isValidNumericValue(value)) return value;
    }
    throw new Error(`Invalid setting "${key}": expected a decimal integer >= 1.`);
  }

  private isValidNumericValue(value: unknown): value is number {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isInteger(value) &&
      value >= 1
    );
  }

  private isValidStatePath(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }

  private writeOverrides(overrides: QualitySettingOverrides): void {
    const temporaryPath = `${this.configPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      mkdirSync(dirname(this.configPath), { recursive: true });
      writeFileSync(temporaryPath, JSON.stringify(overrides, null, 2), "utf8");
      renameSync(temporaryPath, this.configPath);
    } catch (error) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        // Preserve the original write or rename error.
      }
      throw error;
    }
  }

  private deleteConfigFile(): void {
    try {
      unlinkSync(this.configPath);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }
  }
}
