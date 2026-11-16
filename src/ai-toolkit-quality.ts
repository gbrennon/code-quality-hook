import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { QualityHookService } from "./quality-hook-service.ts";

export { CircuitBreakerStore } from "./circuit-breaker-store.ts";
export type { CircuitBreakerOptions } from "./circuit-breaker-options.ts";
export type { BreakerRecord } from "./breaker-record.ts";
export { checkSourceCodePath } from "./check-source-code-path.ts";
export type { QualityApi } from "./quality-api.ts";
export { QualityHookService } from "./quality-hook-service.ts";
export type { ToolContext } from "./tool-context.ts";
export type { ToolResultEvent } from "./tool-result-event.ts";

export default function qualityHook(pi: ExtensionAPI): void {
  const service = new QualityHookService();
  pi.on("tool_result", (event, context) => service.processToolResultEvent(pi, event, context));
}
