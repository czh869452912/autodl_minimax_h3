export type H3AgentConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
};

export type H3AgentInput = {
  threadId: string;
  messages: readonly unknown[];
  signal: AbortSignal;
};

export type H3AgentEvent =
  | { type: "text"; delta: string; phase: "thinking" | "final" }
  | { type: "tool-start"; id: string; name: string; args: unknown }
  | { type: "tool-end"; id: string }
  | { type: "status"; message: string }
  | { type: "error"; error: Error };
