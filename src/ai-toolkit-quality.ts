import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CODE_EXTENSIONS: Readonly<Record<string, true>> = {
  py: true,
  rs: true,
  go: true,
  ts: true,
  tsx: true,
  js: true,
  jsx: true,
  java: true,
  kt: true,
  swift: true,
  cs: true,
  c: true,
  h: true,
  cc: true,
  cpp: true,
  hpp: true,
  cxx: true,
  rb: true,
  php: true,
  scala: true,
  lua: true,
  sh: true,
  md: true,
  markdown: true,
};
const EDIT_TOOLS: Readonly<Record<string, true>> = { write: true, edit: true };

interface BreakerRecord {
  failures: number;
}

export interface CircuitBreakerOptions {
  statePath?: string;
  threshold?: number;
}

export class CircuitBreakerStore {
  private readonly statePath: string;
  private readonly threshold: number;

  public constructor(options: CircuitBreakerOptions = {}) {
    this.statePath = this.resolveStatePath(options);
    this.threshold = this.resolveThreshold(options);
  }

  public isOpen(session: string, cwd: string, path: string): boolean {
    const entry = this.readAll()[this.key(session, cwd, path)];
    return Boolean(entry && entry.failures >= this.threshold);
  }

  public reset(session: string, cwd: string, path: string): void {
    const data = this.readAll();
    const targetKey = this.key(session, cwd, path);
    if (!(targetKey in data)) return;
    delete data[targetKey];
    this.writeAll(data);
  }

  public recordFailure(session: string, cwd: string, path: string): number {
    const data = this.readAll();
    const targetKey = this.key(session, cwd, path);
    const current = data[targetKey];
    const failures = current ? current.failures + 1 : 1;
    data[targetKey] = { failures };
    this.writeAll(data);
    return failures;
  }

  public formatOpenPayload(
    session: string,
    cwd: string,
    path: string,
    failures: number = this.threshold,
  ): string {
    return JSON.stringify({
      type: "circuit_breaker_open",
      status: "terminal",
      session,
      cwd,
      path: resolve(cwd, path),
      failures,
      action: "read_file_again_or_request_help",
    });
  }

  private resolveStatePath(options: CircuitBreakerOptions): string {
    const customPath = options.statePath || process.env.AI_TOOLKIT_CIRCUIT_BREAKER_STATE;
    if (customPath) return customPath;
    const stateBase = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
    return join(stateBase, "ai-toolkit", "hook-circuit-breaker.json");
  }

  private resolveThreshold(options: CircuitBreakerOptions): number {
    const configured = options.threshold ?? this.readConfiguredThreshold();
    return configured >= 1 ? configured : 3;
  }

  private readConfiguredThreshold(): number {
    const configured = Number.parseInt(
      process.env.AI_TOOLKIT_CIRCUIT_BREAKER_THRESHOLD || "3",
      10,
    );
    return Number.isNaN(configured) ? 3 : configured;
  }

  private key(session: string, cwd: string, path: string): string {
    return `${session}::${resolve(cwd, path)}`;
  }

  private readAll(): Record<string, BreakerRecord> {
    if (!existsSync(this.statePath)) return {};
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.statePath, "utf-8"));
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, BreakerRecord>)
        : {};
    } catch {
      return {};
    }
  }

  private writeAll(data: Record<string, BreakerRecord>): void {
    try {
      mkdirSync(dirname(this.statePath), { recursive: true });
      writeFileSync(this.statePath, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      return;
    }
  }
}

export function isSourceCodePath(path: string): boolean {
  const dotIndex = path.lastIndexOf(".");
  if (dotIndex <= 0) return false;
  return Boolean(CODE_EXTENSIONS[path.slice(dotIndex + 1).toLowerCase()]);
}

interface ToolResultEvent {
  isError?: boolean;
  toolName: string;
  input: Record<string, unknown>;
  content: Array<{ type: string; text?: string }>;
}

interface ToolContext {
  cwd: string;
  sessionId?: string;
}

interface QualityApi {
  exec(
    command: string,
    args: string[],
    options: { cwd: string },
  ): Promise<{ code: number; stdout: string; stderr: string }>;
}

export class QualityHookService {
  public constructor(private readonly breaker: CircuitBreakerStore = new CircuitBreakerStore()) {}

  public async handleToolResult(
    api: QualityApi,
    event: ToolResultEvent,
    context: ToolContext,
  ): Promise<{ content: Array<{ type: string; text?: string }> } | undefined> {
    if (event.isError) return;
    const toolName = event.toolName.toLowerCase();
    if (!EDIT_TOOLS[toolName] && toolName !== "read") return;
    const path = String(event.input.path || event.input.filePath || "");
    if (!path || !isSourceCodePath(path)) return;

    const session = String(context.sessionId || context.cwd);
    if (toolName === "read") {
      this.breaker.reset(session, context.cwd, path);
      return;
    }

    if (this.breaker.isOpen(session, context.cwd, path)) {
      return this.appendText(event, this.breaker.formatOpenPayload(session, context.cwd, path));
    }

    const result = await api.exec("check-code-quality", [path], { cwd: context.cwd });
    if (result.code === 0) {
      this.breaker.reset(session, context.cwd, path);
      return;
    }

    const failures = this.breaker.recordFailure(session, context.cwd, path);
    const terminal = this.breaker.isOpen(session, context.cwd, path)
      ? `\n${this.breaker.formatOpenPayload(session, context.cwd, path, failures)}`
      : "";
    return this.appendText(
      event,
      `Code quality check failed:\n${result.stderr || result.stdout}${terminal}`,
    );
  }

  private appendText(
    event: ToolResultEvent,
    text: string,
  ): { content: Array<{ type: string; text?: string }> } {
    return { content: [...event.content, { type: "text", text }] };
  }
}

export default function qualityHook(pi: ExtensionAPI): void {
  const service = new QualityHookService();
  pi.on("tool_result", (event, context) => service.handleToolResult(pi, event, context));
}
