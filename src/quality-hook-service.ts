import { CircuitBreakerStore } from "./circuit-breaker-store.ts";
import { checkSourceCodePath } from "./check-source-code-path.ts";
import type { QualityApi } from "./quality-api.ts";
import type { ToolContext } from "./tool-context.ts";
import type { ToolResultEvent } from "./tool-result-event.ts";

const EDIT_TOOLS: Readonly<Record<string, true>> = { write: true, edit: true };

export class QualityHookService {
  public constructor(private readonly breaker: CircuitBreakerStore = new CircuitBreakerStore()) {}

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

    const result = await api.exec("check-code-quality", [path], { cwd: context.cwd });
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
