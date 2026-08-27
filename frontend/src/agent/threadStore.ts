import type { ThreadMessageLike } from "@assistant-ui/react";

const STORAGE_KEY = "h3-prompt-assistant-thread";
const VERSION = 1;

export type StoredThread = {
  version: 1;
  threadId: string;
  messages: ThreadMessageLike[];
  finalPrompt: string | null;
  updatedAt: number;
};

function storage(): Storage {
  if (typeof globalThis.localStorage !== "undefined") return globalThis.localStorage;
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function sanitizeMessage(message: ThreadMessageLike): ThreadMessageLike {
  return JSON.parse(JSON.stringify({
    id: message.id,
    role: message.role,
    content: message.content,
  }));
}

export function saveThread(input: Pick<StoredThread, "threadId" | "messages" | "finalPrompt">): void {
  const record: StoredThread = {
    version: VERSION,
    threadId: input.threadId,
    messages: input.messages.map(sanitizeMessage),
    finalPrompt: input.finalPrompt || null,
    updatedAt: Date.now(),
  };
  try {
    storage().setItem(STORAGE_KEY, JSON.stringify(record));
  } catch (error) {
    throw new Error(`thread storage write failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function loadThread(): StoredThread | null {
  let raw: string | null;
  try {
    raw = storage().getItem(STORAGE_KEY);
  } catch (error) {
    throw new Error(`thread storage read failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw.replace(/^\uFEFF/, "").trim()) as Partial<StoredThread>;
    if (value.version !== VERSION || typeof value.threadId !== "string" || !Array.isArray(value.messages)) {
      throw new Error("invalid schema");
    }
    return {
      version: VERSION,
      threadId: value.threadId,
      messages: value.messages,
      finalPrompt: typeof value.finalPrompt === "string" ? value.finalPrompt : null,
      updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
    };
  } catch (error) {
    // A stale or partially written thread must not prevent the app from mounting.
    try {
      storage().removeItem(STORAGE_KEY);
    } catch {
      // Ignore cleanup failures; the next read will retry the same recovery path.
    }
    return null;
  }
}
