import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import qualityHook, * as qualityHookEntrypoint from "../src/ai-toolkit-quality.ts";
import { checkSourceCodePath } from "../src/check-source-code-path.ts";
import { QualitySettingsStore } from "../src/quality-settings.ts";

type Notification = {
  message: string;
  type: "info" | "warning" | "error";
};

type CommandContext = {
  ui?: {
    notify(message: string, type?: Notification["type"]): void;
    select?(title: string, options: string[]): Promise<string | undefined>;
    input?(title: string, placeholder?: string): Promise<string | undefined>;
    editor?(title: string, prefill?: string): Promise<string | undefined>;
    custom?<T>(
      factory: (...args: unknown[]) => {
        render(width: number): string[];
        handleInput(data: string): void;
        invalidate(): void;
      },
      options?: { overlay?: boolean },
    ): Promise<T | undefined>;
  };
};

type CommandRegistration = {
  description?: string;
  getArgumentCompletions?: (
    prefix: string,
  ) => Array<{ value: string; label: string; description?: string }> | null;
  handler(args: string, context: CommandContext): Promise<void>;
};

type ToolResultHandler = (
  event: {
    isError?: boolean;
    toolName: string;
    input: Record<string, unknown>;
    content: Array<{ type: string; text?: string }>;
  },
  context: { cwd: string; sessionId?: string },
) => Promise<unknown>;

type CheckerCall = {
  command: string;
  args: string[];
  options: { cwd: string };
};

type FakeExtensionHost = {
  api: Parameters<typeof qualityHook>[0];
  actions: string[];
  commands: Map<string, CommandRegistration>;
  handlers: Map<string, ToolResultHandler>;
  calls: CheckerCall[];
  notifications: Notification[];
  editorPrefills: string[];
  selectOptions: string[][];
  customPanels: string[][];
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

function createFakeExtensionHost(): FakeExtensionHost {
  const actions: string[] = [];
  const commands = new Map<string, CommandRegistration>();
  const handlers = new Map<string, ToolResultHandler>();
  const calls: CheckerCall[] = [];
  const notifications: Notification[] = [];
  const editorPrefills: string[] = [];
  const selectOptions: string[][] = [];
  const customPanels: string[][] = [];
  const api = {
    exec: async (command: string, args: string[], options: { cwd: string }) => {
      calls.push({ command, args, options });
      return { code: 0, stdout: "", stderr: "" };
    },
    on: (event: string, handler: unknown) => {
      actions.push(`on:${event}`);
      handlers.set(event, handler as ToolResultHandler);
    },
    registerCommand: (name: string, command: CommandRegistration) => {
      actions.push(`registerCommand:${name}`);
      commands.set(name, command);
    },
  } as unknown as FakeExtensionHost["api"];
  return {
    api,
    actions,
    commands,
    handlers,
    calls,
    notifications,
    editorPrefills,
    selectOptions,
    customPanels,
  };
}

function commandFor(host: FakeExtensionHost): CommandRegistration {
  const command = host.commands.get("code-quality");
  if (!command) throw new Error("code-quality command was not registered");
  return command;
}

function commandContext(host: FakeExtensionHost): CommandContext {
  return {
    ui: {
      notify: (message, type = "info") => {
        host.notifications.push({ message, type });
      },
    },
  };
}

function menuContext(
  host: FakeExtensionHost,
  choice: string,
  value?: string,
): CommandContext {
  return {
    ui: {
      notify: (message, type = "info") => {
        host.notifications.push({ message, type });
      },
      select: async (_title, options) => {
        host.selectOptions.push(options);
        return choice;
      },
      input: async () => value,
      editor: async (_title, prefill) => {
        host.editorPrefills.push(prefill ?? "");
        return value;
      },
      custom: async (factory) => {
        const component = factory(undefined, undefined, undefined, () => undefined);
        host.customPanels.push(component.render(120));
        return undefined;
      },
    },
  };
}

function writeEvent(): {
  isError: false;
  toolName: string;
  input: { path: string };
  content: Array<{ type: string; text?: string }>;
} {
  return {
    isError: false,
    toolName: "write",
    input: { path: "src/main.py" },
    content: [{ type: "text", text: "write complete" }],
  };
}

async function dispatchWrite(host: FakeExtensionHost, cwd: string): Promise<void> {
  const handler = host.handlers.get("tool_result");
  if (!handler) throw new Error("tool_result handler was not registered");
  await handler(writeEvent(), { cwd, sessionId: "test-session" });
}

describe("ai-toolkit-quality", () => {
  test("exports the hook registration function", () => {
    expect(typeof qualityHook).toBe("function");
  });

  test("re-exports the source predicate", () => {
    expect(qualityHookEntrypoint.checkSourceCodePath).toBe(checkSourceCodePath);
    expect(qualityHookEntrypoint.checkSourceCodePath("src/main.py")).toBe(true);
  });

  test("registers settings before the tool-result handler and uses the injected path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-entrypoint-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "settings", "code-quality-hook.json");
    const host = createFakeExtensionHost();
    qualityHook(host.api, new QualitySettingsStore({ configPath }));

    expect(host.actions).toEqual(["registerCommand:code-quality", "on:tool_result"]);
    expect(commandFor(host).description).toBe(
      "Inspect or change code-quality hook settings",
    );

    await commandFor(host).handler("show", commandContext(host));

    expect(host.notifications[host.notifications.length - 1]?.type).toBe("info");
    expect(host.notifications[host.notifications.length - 1]?.message).toContain(configPath);
    expect(host.notifications[host.notifications.length - 1]?.message).toContain(
      "max-complexity=5",
    );
  });
  test("offers subcommand and setting completions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-entrypoint-"));
    temporaryDirectories.push(directory);
    const host = createFakeExtensionHost();
    qualityHook(
      host.api,
      new QualitySettingsStore({
        configPath: join(directory, "settings", "code-quality-hook.json"),
      }),
    );

    const completions = commandFor(host).getArgumentCompletions;
    expect(completions?.("s")?.map((item) => item.value)).toEqual(["show", "set"]);
    expect(completions?.("set m")?.map((item) => item.value)).toEqual([
      "max-complexity",
      "max-function-length",
      "max-arguments",
    ]);
    expect(completions?.("reset c")?.map((item) => item.value)).toEqual([
      "circuit-breaker-threshold",
      "circuit-breaker-state-path",
    ]);
  });
  test("shows resolved settings as a read-only menu", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-entrypoint-"));
    temporaryDirectories.push(directory);
    const host = createFakeExtensionHost();
    qualityHook(
      host.api,
      new QualitySettingsStore({
        configPath: join(directory, "settings", "code-quality-hook.json"),
      }),
    );

    await commandFor(host).handler("", menuContext(host, "Show current settings"));

    expect(host.customPanels).toHaveLength(1);
    expect(host.customPanels[0]).toEqual(
      expect.arrayContaining([
        "Code-quality settings (read-only)",
        "max-complexity=5",
        "max-function-length=50",
        "max-arguments=5",
        "circuit-breaker-threshold=3",
        "circuit-breaker-state-path=(unset)",
        `Config: ${join(directory, "settings", "code-quality-hook.json")}`,
      ]),
    );
    expect(host.notifications).toHaveLength(0);
  });
  test("opens a portable settings menu and applies the selected value", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-entrypoint-"));
    temporaryDirectories.push(directory);
    const host = createFakeExtensionHost();
    qualityHook(
      host.api,
      new QualitySettingsStore({
        configPath: join(directory, "settings", "code-quality-hook.json"),
      }),
    );

    await commandFor(host).handler(
      "",
      menuContext(host, "Set max-complexity", "9"),
    );
    await dispatchWrite(host, directory);

    expect(host.calls[0]?.args.slice(0, 2)).toEqual(["-C", "9"]);
    expect(host.editorPrefills).toEqual(["5"]);
    expect(host.customPanels[0]).toEqual(
      expect.arrayContaining(["Set max-complexity=9", "max-complexity=9"]),
    );
    expect(host.notifications).toHaveLength(0);
  });

  test("applies a successful setting command to the next tool-result event", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-entrypoint-"));
    temporaryDirectories.push(directory);
    const host = createFakeExtensionHost();
    qualityHook(
      host.api,
      new QualitySettingsStore({
        configPath: join(directory, "settings", "code-quality-hook.json"),
      }),
    );

    await commandFor(host).handler("set max-complexity 9", menuContext(host, "", undefined));
    await dispatchWrite(host, directory);

    expect(host.calls).toHaveLength(1);
    expect(host.calls[0]?.command).toBe("check-code-quality");
    expect(host.calls[0]?.args.slice(0, 2)).toEqual(["-C", "9"]);
    expect(host.customPanels[0]).toEqual(
      expect.arrayContaining(["Set max-complexity=9", "max-complexity=9"]),
    );
    expect(host.notifications).toHaveLength(0);
  });

  test("rejects a failed setting command without changing the next invocation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-entrypoint-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "settings", "code-quality-hook.json");
    const store = new QualitySettingsStore({ configPath });
    const host = createFakeExtensionHost();
    qualityHook(host.api, store);

    await commandFor(host).handler("set max-complexity 0", commandContext(host));
    await dispatchWrite(host, directory);

    expect(host.notifications[host.notifications.length - 1]?.type).toBe("error");
    expect(host.calls[0]?.args.slice(0, 2)).toEqual(["-C", "5"]);
    expect(store.load().maxComplexity).toBe(5);
  });

  test("reports reset and restores the resolved setting", async () => {
    const directory = await mkdtemp(join(tmpdir(), "code-quality-hook-entrypoint-"));
    temporaryDirectories.push(directory);
    const host = createFakeExtensionHost();
    qualityHook(
      host.api,
      new QualitySettingsStore({
        configPath: join(directory, "settings", "code-quality-hook.json"),
      }),
    );
    const context = menuContext(host, "", undefined);

    await commandFor(host).handler("set max-complexity 9", context);
    await commandFor(host).handler("reset max-complexity", context);

    expect(host.customPanels[1]).toEqual(
      expect.arrayContaining(["Reset max-complexity", "max-complexity=5"]),
    );
    expect(host.notifications).toHaveLength(0);
    await commandFor(host).handler("show", context);
    expect(host.customPanels[2]).toEqual(
      expect.arrayContaining(["max-complexity=5"]),
    );
  });
});
