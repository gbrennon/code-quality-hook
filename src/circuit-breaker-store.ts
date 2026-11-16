import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { BreakerRecord } from "./breaker-record.ts";
import type { CircuitBreakerOptions } from "./circuit-breaker-options.ts";

export class CircuitBreakerStore {
  private readonly statePath: string;
  private readonly threshold: number;

  public constructor(options: CircuitBreakerOptions = {}) {
    this.statePath = this.resolveCircuitBreakerStatePath(options);
    this.threshold = this.resolveCircuitBreakerThreshold(options);
  }

  public checkCircuitBreakerIsOpen(session: string, cwd: string, path: string): boolean {
    const entry = this.readCircuitBreakerState()[this.buildCircuitBreakerKey(session, cwd, path)];
    return Boolean(entry && entry.failures >= this.threshold);
  }

  public resetCircuitBreakerFailures(session: string, cwd: string, path: string): void {
    const data = this.readCircuitBreakerState();
    const targetKey = this.buildCircuitBreakerKey(session, cwd, path);
    if (!(targetKey in data)) return;
    delete data[targetKey];
    this.writeCircuitBreakerState(data);
  }

  public recordCircuitBreakerFailure(session: string, cwd: string, path: string): number {
    const data = this.readCircuitBreakerState();
    const targetKey = this.buildCircuitBreakerKey(session, cwd, path);
    const current = data[targetKey];
    const failures = current ? current.failures + 1 : 1;
    data[targetKey] = { failures };
    this.writeCircuitBreakerState(data);
    return failures;
  }

  public formatCircuitBreakerOpenPayload(
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

  private resolveCircuitBreakerStatePath(options: CircuitBreakerOptions): string {
    const customPath = options.statePath || process.env.AI_TOOLKIT_CIRCUIT_BREAKER_STATE;
    if (customPath) return customPath;
    const stateBase = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
    return join(stateBase, "ai-toolkit", "hook-circuit-breaker.json");
  }

  private resolveCircuitBreakerThreshold(options: CircuitBreakerOptions): number {
    const configured = options.threshold ?? this.readConfiguredCircuitBreakerThreshold();
    return configured >= 1 ? configured : 3;
  }

  private readConfiguredCircuitBreakerThreshold(): number {
    const configured = Number.parseInt(
      process.env.AI_TOOLKIT_CIRCUIT_BREAKER_THRESHOLD || "3",
      10,
    );
    return Number.isNaN(configured) ? 3 : configured;
  }

  private buildCircuitBreakerKey(session: string, cwd: string, path: string): string {
    return `${session}::${resolve(cwd, path)}`;
  }

  private readCircuitBreakerState(): Record<string, BreakerRecord> {
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

  private writeCircuitBreakerState(data: Record<string, BreakerRecord>): void {
    try {
      mkdirSync(dirname(this.statePath), { recursive: true });
      writeFileSync(this.statePath, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      return;
    }
  }
}
