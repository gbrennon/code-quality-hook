export interface ToolResultEvent {
  isError?: boolean;
  toolName: string;
  input: Record<string, unknown>;
  content: Array<{ type: string; text?: string }>;
}
