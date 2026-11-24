import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { QualityHookService } from "./quality-hook-service.ts";
import {
  isQualitySettingKey,
  QualitySettingsStore,
  type QualitySettingKey,
  type QualitySettings,
} from "./quality-settings.ts";

export { CircuitBreakerStore } from "./circuit-breaker-store.ts";
export type { CircuitBreakerOptions } from "./circuit-breaker-options.ts";
export type { BreakerRecord } from "./breaker-record.ts";
export { checkSourceCodePath } from "./check-source-code-path.ts";
export type { QualityApi } from "./quality-api.ts";
export { QualityHookService } from "./quality-hook-service.ts";
export {
  QualitySettingsStore,
  type QualitySettingKey,
  type QualitySettings,
  type QualitySettingsStoreOptions,
} from "./quality-settings.ts";
export type { ToolContext } from "./tool-context.ts";
export type { ToolResultEvent } from "./tool-result-event.ts";

type SettingsPanel = {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
};
type SettingsPanelFactory = (
  tui: unknown,
  theme: unknown,
  keybindings: unknown,
  done: (value?: undefined) => void,
) => SettingsPanel;

type NotificationContext = {
  ui?: {
    notify(message: string, type?: "info" | "error"): void;
    select?(title: string, options: string[]): Promise<string | undefined>;
    input?(title: string, placeholder?: string): Promise<string | undefined>;
    editor?(title: string, prefill?: string): Promise<string | undefined>;
    custom?<T>(
      factory: SettingsPanelFactory,
      options?: { overlay?: boolean },
    ): Promise<T | undefined>;
  };
};

type QualityCommand =
  | { kind: "show" }
  | { kind: "menu" }
  | { kind: "set"; key: QualitySettingKey; value: string }
  | { kind: "reset"; key?: QualitySettingKey };
type CompletionItem = {
  value: string;
  label: string;
  description?: string;
};

const MENU_ACTIONS = [
  "Show current settings",
  "Set max-complexity",
  "Set max-function-length",
  "Set max-arguments",
  "Set circuit-breaker-threshold",
  "Set circuit-breaker-state-path",
  "Reset a setting",
  "Reset all settings",
];
const MENU_SETTING_KEYS: Readonly<Record<string, QualitySettingKey>> = {
  "Set max-complexity": "max-complexity",
  "Set max-function-length": "max-function-length",
  "Set max-arguments": "max-arguments",
  "Set circuit-breaker-threshold": "circuit-breaker-threshold",
  "Set circuit-breaker-state-path": "circuit-breaker-state-path",
};
const RESET_OPTIONS: QualitySettingKey[] = [
  "max-complexity",
  "max-function-length",
  "max-arguments",
  "circuit-breaker-threshold",
  "circuit-breaker-state-path",
];
const COMMAND_COMPLETIONS: CompletionItem[] = [
  { value: "menu", label: "menu", description: "Open the interactive settings menu" },
  { value: "show", label: "show", description: "Show resolved settings" },
  { value: "set", label: "set", description: "Change one setting" },
  { value: "reset", label: "reset", description: "Reset one or all settings" },
];
const SETTING_COMPLETIONS: CompletionItem[] = RESET_OPTIONS.map((key) => ({
  value: key,
  label: key,
}));

function notify(context: NotificationContext, message: string, type: "info" | "error"): void {
  context.ui?.notify?.(message, type);
}

function settingValue(key: QualitySettingKey, settings: QualitySettings): number | string {
  switch (key) {
    case "max-complexity":
      return settings.maxComplexity;
    case "max-function-length":
      return settings.maxFunctionLength;
    case "max-arguments":
      return settings.maxArguments;
    case "circuit-breaker-threshold":
      return settings.circuitBreakerThreshold;
    case "circuit-breaker-state-path":
      return settings.circuitBreakerStatePath ?? "(unset)";
  }
}

function formatSettings(settings: QualitySettings, configPath: string): string {
  return [
    `Code-quality settings (${configPath})`,
    `max-complexity=${settings.maxComplexity}`,
    `max-function-length=${settings.maxFunctionLength}`,
    `max-arguments=${settings.maxArguments}`,
    `circuit-breaker-threshold=${settings.circuitBreakerThreshold}`,
    `circuit-breaker-state-path=${settings.circuitBreakerStatePath ?? "(unset)"}`,
  ].join("; ");
}

function settingMenuOptions(settings: QualitySettings): string[] {
  return [
    `max-complexity=${settings.maxComplexity}`,
    `max-function-length=${settings.maxFunctionLength}`,
    `max-arguments=${settings.maxArguments}`,
    `circuit-breaker-threshold=${settings.circuitBreakerThreshold}`,
    `circuit-breaker-state-path=${settings.circuitBreakerStatePath ?? "(unset)"}`,
  ];
}

async function showSettings(
  context: NotificationContext,
  settingsStore: QualitySettingsStore,
  status?: string,
): Promise<void> {
  const settings = settingsStore.load();
  const custom = context.ui?.custom?.bind(context.ui);
  const resolvedText = formatSettings(settings, settingsStore.getConfigPath());
  if (!custom) {
    notify(context, status ? `${status}; ${resolvedText}` : resolvedText, "info");
    return;
  }

  await custom(
    (_tui, _theme, _keybindings, done) => ({
      render(width: number): string[] {
        const lines = [
          status ? "Code-quality settings" : "Code-quality settings (read-only)",
          ...(status ? ["", status] : []),
          "",
          ...settingMenuOptions(settings),
          "",
          `Config: ${settingsStore.getConfigPath()}`,
          "Press Enter or Escape to close.",
        ];
        return lines.map((line) => line.slice(0, Math.max(width, 1)));
      },
      handleInput(data: string): void {
        if (data === "\r" || data === "\n" || data === "\u001b") done();
      },
      invalidate(): void {},
    }),
    { overlay: true },
  );
}

function getArgumentCompletions(prefix: string): CompletionItem[] | null {
  const normalized = prefix.trimStart();
  const separator = normalized.indexOf(" ");
  if (separator < 0) {
    const matches = COMMAND_COMPLETIONS.filter((item) => item.value.startsWith(normalized));
    return matches.length > 0 ? matches : null;
  }

  const command = normalized.slice(0, separator);
  if (command !== "set" && command !== "reset") return null;
  const settingPrefix = normalized.slice(separator + 1).trimStart();
  const matches = SETTING_COMPLETIONS.filter((item) =>
    item.value.startsWith(settingPrefix),
  );
  return matches.length > 0 ? matches : null;
}

function parseCommand(args: string): QualityCommand {
  const command = args.trim();
  if (command === "") return { kind: "menu" };
  if (command === "show") return { kind: "show" };
  if (command === "menu") return { kind: "menu" };

  const setMatch = /^set(?:\s+(\S+)(?:\s+([\s\S]*))?)?$/.exec(command);
  if (setMatch) {
    const rawKey = setMatch[1];
    if (!rawKey || !isQualitySettingKey(rawKey)) {
      throw new Error(`Unknown code-quality setting: ${rawKey || "(missing key)"}`);
    }
    const value = setMatch[2]?.trim() ?? "";
    if (rawKey !== "circuit-breaker-state-path" && /\s/.test(value)) {
      throw new Error(`${rawKey} expects one decimal integer value`);
    }
    if (!value) throw new Error(`Missing value for ${rawKey}`);
    return { kind: "set", key: rawKey, value };
  }

  const resetMatch = /^reset(?:\s+([\s\S]*))?$/.exec(command);
  if (resetMatch) {
    const rawKey = resetMatch[1]?.trim() ?? "";
    if (!rawKey) return { kind: "reset" };
    if (/\s/.test(rawKey) || !isQualitySettingKey(rawKey)) {
      throw new Error(`Unknown code-quality setting: ${rawKey}`);
    }
    return { kind: "reset", key: rawKey };
  }

  throw new Error(
    "Usage: /code-quality [show|menu|set <key> <value>|reset [<key>]]",
  );
}

async function applyReset(
  context: NotificationContext,
  settingsStore: QualitySettingsStore,
  service: QualityHookService,
  key?: QualitySettingKey,
): Promise<void> {
  const settings = settingsStore.reset(key);
  service.updateSettings(settings);
  const status = key
    ? `Reset ${key}`
    : "Reset all code-quality settings";
  await showSettings(context, settingsStore, status);
}

async function handleMenu(
  context: NotificationContext,
  settingsStore: QualitySettingsStore,
  service: QualityHookService,
): Promise<void> {
  const select = context.ui?.select?.bind(context.ui);
  if (!select) {
    await showSettings(context, settingsStore);
    return;
  }

  const action = await select("Code-quality settings", MENU_ACTIONS);
  if (!action) return;
  if (action === "Show current settings") {
    await showSettings(context, settingsStore);
    return;
  }
  if (action === "Reset all settings") {
    await applyReset(context, settingsStore, service);
    return;
  }
  if (action === "Reset a setting") {
    const key = await select("Reset which setting?", RESET_OPTIONS);
    if (key && isQualitySettingKey(key)) {
      await applyReset(context, settingsStore, service, key);
    }
    return;
  }

  const key = MENU_SETTING_KEYS[action];
  if (!key) throw new Error(`Unknown settings menu action: ${action}`);
  const current = settingsStore.load();
  const prefill = key === "circuit-breaker-state-path"
    ? current.circuitBreakerStatePath ?? ""
    : String(settingValue(key, current));
  const editor = context.ui?.editor?.bind(context.ui);
  const input = context.ui?.input?.bind(context.ui);
  if (!editor && !input) {
    await showSettings(context, settingsStore);
    return;
  }
  const rawValue = editor
    ? await editor(`Set ${key}`, prefill)
    : await input!(`Set ${key}`, prefill);
  if (rawValue === undefined) return;
  const settings = settingsStore.saveSetting(key, rawValue);
  service.updateSettings(settings);
  await showSettings(context, settingsStore, `Set ${key}=${settingValue(key, settings)}`);
}

async function handleCommand(
  command: QualityCommand,
  context: NotificationContext,
  settingsStore: QualitySettingsStore,
  service: QualityHookService,
): Promise<void> {
  if (command.kind === "show") {
    await showSettings(context, settingsStore);
    return;
  }
  if (command.kind === "menu") {
    await handleMenu(context, settingsStore, service);
    return;
  }
  if (command.kind === "set") {
    const settings = settingsStore.saveSetting(command.key, command.value);
    service.updateSettings(settings);
    await showSettings(
      context,
      settingsStore,
      `Set ${command.key}=${settingValue(command.key, settings)}`,
    );
    return;
  }
  await applyReset(context, settingsStore, service, command.key);
}

export default function qualityHook(
  pi: ExtensionAPI,
  settingsStore = new QualitySettingsStore(),
): void {
  const settings = settingsStore.load();
  const service = new QualityHookService({ settings });
  pi.registerCommand("code-quality", {
    description: "Inspect or change code-quality hook settings",
    getArgumentCompletions,
    handler: async (args, context) => {
      try {
        await handleCommand(parseCommand(args), context, settingsStore, service);
      } catch (error) {
        notify(context, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
  pi.on("tool_result", (event, context) => service.processToolResultEvent(pi, event, context));
}
