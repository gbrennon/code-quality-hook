import { fileURLToPath } from "node:url";
import { DEFAULT_QUALITY_SETTINGS } from "./quality-settings.ts";
import type { QualitySettings } from "./quality-settings.ts";
import { CircuitBreakerStore } from "./circuit-breaker-store.ts";
import { checkSourceCodePath } from "./check-source-code-path.ts";
import { resolveSemgrepConfig } from "./resolve-semgrep-config.ts";
import type { QualityApi } from "./quality-api.ts";
import type { ToolContext } from "./tool-context.ts";
import type { ToolResultEvent } from "./tool-result-event.ts";

const EDIT_TOOLS: Readonly<Record<string, true>> = { write: true, edit: true };
const DEFAULT_SEMGREP_RULES_PATH = fileURLToPath(new URL("./semgrep-rules", import.meta.url));

export interface QualityHookServiceOptions {
  breaker?: CircuitBreakerStore;
  semgrepRulesPath?: string;
  settings?: QualitySettings;
}

export class QualityHookService {
  private breaker: CircuitBreakerStore;
  private readonly semgrepRulesPath: string;
  private settings: QualitySettings;

  public constructor(options: QualityHookServiceOptions = {}) {
    this.breaker = options.breaker ?? new CircuitBreakerStore();
    this.semgrepRulesPath = options.semgrepRulesPath ?? DEFAULT_SEMGREP_RULES_PATH;
    this.settings = options.settings ?? DEFAULT_QUALITY_SETTINGS;
  }

  public updateSettings(settings: QualitySettings): void {
    this.settings = settings;
    this.breaker = new CircuitBreakerStore({
      threshold: settings.circuitBreakerThreshold,
      statePath: settings.circuitBreakerStatePath,
    });
  }

  public async processToolResultEvent(
    api: QualityApi,
    event: ToolResultEvent,
    context: ToolContext,
  ): Promise<{ content: Array<{ type: string; text?: string }> } | undefined> {
    if (event.isError) return;
    const toolName = event.toolName.toLowerCase();
    if (!EDIT_TOOLS[toolName] && toolName !== "read") return;
    const path = String(event.input.path || event.input.filePath || "");
    if (!path || !checkSourceCodePath(path)) return;

    const session = String(context.sessionId || context.cwd);
    if (toolName === "read") {
      this.breaker.resetCircuitBreakerFailures(session, context.cwd, path);
      return;
    }

    if (this.breaker.checkCircuitBreakerIsOpen(session, context.cwd, path)) {
      return this.appendDiagnosticText(
        event,
        this.breaker.formatCircuitBreakerOpenPayload(session, context.cwd, path),
      );
    }

    const semgrepConfig = resolveSemgrepConfig(context.cwd, path, this.semgrepRulesPath);
    const result = await api.exec(
      "check-code-quality",
      [
        "-C",
        String(this.settings.maxComplexity),
        "-L",
        String(this.settings.maxFunctionLength),
        "-a",
        String(this.settings.maxArguments),
        "--semgrep-config",
        semgrepConfig,
        path,
      ],
      { cwd: context.cwd },
    );
    if (result.code === 0) {
      this.breaker.resetCircuitBreakerFailures(session, context.cwd, path);
      return;
    }

    const failures = this.breaker.recordCircuitBreakerFailure(session, context.cwd, path);
    const terminal = this.breaker.checkCircuitBreakerIsOpen(session, context.cwd, path)
      ? `\n${this.breaker.formatCircuitBreakerOpenPayload(session, context.cwd, path, failures)}`
      : "";
    return this.appendDiagnosticText(
      event,
      `Code quality check failed:\n${result.stderr || result.stdout}${terminal}`,
    );
  }

  private appendDiagnosticText(
    event: ToolResultEvent,
    text: string,
  ): { content: Array<{ type: string; text?: string }> } {
    return { content: [...event.content, { type: "text", text }] };
  }
}
