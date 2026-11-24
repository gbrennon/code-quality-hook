import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_QUALITY_SETTINGS,
  isQualitySettingKey,
  QualitySettingsStore,
  type QualitySettingKey,
} from "../src/quality-settings.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function createStore(): Promise<{
  directory: string;
  configPath: string;
  store: QualitySettingsStore;
}> {
  const directory = await mkdtemp(join(tmpdir(), "code-quality-settings-"));
  temporaryDirectories.push(directory);
  const configPath = join(directory, "config", "code-quality-hook.json");
  return { directory, configPath, store: new QualitySettingsStore({ configPath }) };
}

function restoreEnvironment(name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previousValue;
  }
}

describe("QualitySettingsStore", () => {
  test("uses resolved defaults when the config file is missing", async () => {
    const { configPath, store } = await createStore();

    const settings = store.load();

    expect(store.getConfigPath()).toBe(configPath);
    expect(settings).toEqual(DEFAULT_QUALITY_SETTINGS);
    expect(existsSync(configPath)).toBe(false);
  });

  test("loads persisted numeric and state-path overrides", async () => {
    const { configPath, store } = await createStore();
    await mkdir(join(configPath, ".."), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        "max-complexity": 9,
        "max-function-length": 80,
        "max-arguments": 7,
        "circuit-breaker-threshold": 4,
        "circuit-breaker-state-path": "/tmp/code quality/state.json",
      }),
    );

    const settings = store.load();

    expect(settings).toEqual({
      maxComplexity: 9,
      maxFunctionLength: 80,
      maxArguments: 7,
      circuitBreakerThreshold: 4,
      circuitBreakerStatePath: "/tmp/code quality/state.json",
    });
  });

  test("ignores malformed, non-object, invalid, and unreadable persisted data", async () => {
    const { configPath, store } = await createStore();
    await mkdir(join(configPath, ".."), { recursive: true });
    const invalidValues = {
      "max-complexity": 0,
      "max-function-length": -1,
      "max-arguments": 1.5,
      "circuit-breaker-threshold": "not-a-number",
      "circuit-breaker-state-path": "   ",
    };
    await writeFile(configPath, JSON.stringify(invalidValues));

    expect(store.load()).toEqual(DEFAULT_QUALITY_SETTINGS);

    await writeFile(configPath, JSON.stringify([]));
    expect(store.load()).toEqual(DEFAULT_QUALITY_SETTINGS);

    await writeFile(configPath, "not json");
    expect(store.load()).toEqual(DEFAULT_QUALITY_SETTINGS);

    await rm(configPath);
    await mkdir(configPath);
    expect(store.load()).toEqual(DEFAULT_QUALITY_SETTINGS);

  });

  test("recognizes only the supported setting keys", () => {
    const supportedKeys: QualitySettingKey[] = [
      "max-complexity",
      "max-function-length",
      "max-arguments",
      "circuit-breaker-threshold",
      "circuit-breaker-state-path",
    ];

    for (const key of supportedKeys) {
      expect(isQualitySettingKey(key)).toBe(true);
    }
    expect(isQualitySettingKey("unknown-setting")).toBe(false);
  });

  test("validates settings, persists overrides atomically, and reloads them", async () => {
    const { configPath, directory, store } = await createStore();

    expect(() => store.saveSetting("max-complexity", "0")).toThrow(/max-complexity/);
    expect(() => store.saveSetting("max-complexity", "1.5")).toThrow(/max-complexity/);
    expect(() => store.saveSetting("max-complexity", "-1")).toThrow(/max-complexity/);
    expect(() => store.saveSetting("max-complexity", "not-a-number")).toThrow(/max-complexity/);
    expect(() => store.saveSetting("max-complexity", "")).toThrow(/max-complexity/);
    expect(() => store.saveSetting("circuit-breaker-state-path", "   ")).toThrow(
      /circuit-breaker-state-path/,
    );
    expect(() =>
      store.saveSetting("unknown-setting" as QualitySettingKey, "1"),
    ).toThrow(/unknown-setting/);
    expect(existsSync(configPath)).toBe(false);

    const savedSettings = store.saveSetting("max-complexity", "9");
    expect(savedSettings.maxComplexity).toBe(9);
    expect(await readFile(configPath, "utf8")).toContain('"max-complexity": 9');
    expect(await readdir(join(directory, "config"))).toEqual(["code-quality-hook.json"]);

    const statePath = "/tmp/code quality/state.json";
    store.saveSetting("circuit-breaker-state-path", statePath);
    expect(new QualitySettingsStore({ configPath }).load()).toMatchObject({
      maxComplexity: 9,
      circuitBreakerStatePath: statePath,
    });

    const persistedBeforeInvalidSave = await readFile(configPath, "utf8");
    expect(() => store.saveSetting("max-arguments", "0")).toThrow(/max-arguments/);
    expect(await readFile(configPath, "utf8")).toBe(persistedBeforeInvalidSave);
  });

  test.serial("resets overrides to environment and default fallback without changing env", async () => {
    const previousThreshold = process.env.AI_TOOLKIT_CIRCUIT_BREAKER_THRESHOLD;
    const previousStatePath = process.env.AI_TOOLKIT_CIRCUIT_BREAKER_STATE;
    const { configPath, store } = await createStore();
    const environmentStatePath = "/tmp/environment state.json";

    try {
      process.env.AI_TOOLKIT_CIRCUIT_BREAKER_THRESHOLD = "7";
      process.env.AI_TOOLKIT_CIRCUIT_BREAKER_STATE = environmentStatePath;
      store.saveSetting("circuit-breaker-threshold", "9");
      store.saveSetting("circuit-breaker-state-path", "/tmp/persisted state.json");
      store.saveSetting("max-arguments", "8");

      const afterThresholdReset = store.reset("circuit-breaker-threshold");
      expect(afterThresholdReset.circuitBreakerThreshold).toBe(7);
      expect(afterThresholdReset.maxArguments).toBe(8);
      expect(existsSync(configPath)).toBe(true);

      const afterStateReset = store.reset("circuit-breaker-state-path");
      expect(afterStateReset.circuitBreakerStatePath).toBe(environmentStatePath);
      expect(afterStateReset.maxArguments).toBe(8);

      const afterAllReset = store.reset();
      expect(afterAllReset).toMatchObject({
        maxComplexity: 5,
        maxFunctionLength: 50,
        maxArguments: 5,
        circuitBreakerThreshold: 7,
        circuitBreakerStatePath: environmentStatePath,
      });
      expect(existsSync(configPath)).toBe(false);

      delete process.env.AI_TOOLKIT_CIRCUIT_BREAKER_THRESHOLD;
      delete process.env.AI_TOOLKIT_CIRCUIT_BREAKER_STATE;
      expect(store.load()).toEqual(DEFAULT_QUALITY_SETTINGS);
    } finally {
      restoreEnvironment("AI_TOOLKIT_CIRCUIT_BREAKER_THRESHOLD", previousThreshold);
      restoreEnvironment("AI_TOOLKIT_CIRCUIT_BREAKER_STATE", previousStatePath);
    }
  });
});
