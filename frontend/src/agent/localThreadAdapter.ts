import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import {
  createLocalStorageAdapter,
  type AsyncStorageLike,
} from "@assistant-ui/core/react";

const STORAGE_PREFIX = "h3-prompt-assistant:";
const ACTIVE_THREAD_KEY = `${STORAGE_PREFIX}active-thread`;
const LEGACY_INDEX_KEY = "h3-prompt-assistant-threads-index";
const LEGACY_THREAD_PREFIX = "h3-prompt-assistant-thread:";

const memoryValues = new Map<string, string>();

type SyncStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type LegacyMessage = {
  id?: string;
  role?: "system" | "user" | "assistant";
  content?: unknown;
  attachments?: unknown[];
};

function migrateLegacyThreadStorage(storage: SyncStorageLike): void {
  if (storage.getItem(`${STORAGE_PREFIX}threads`)) return;

  let summaries: Array<{ threadId: string; title?: string; createdAt?: number }> = [];
  try {
    const parsed = JSON.parse(storage.getItem(LEGACY_INDEX_KEY) || "[]") as unknown;
    if (Array.isArray(parsed)) {
      summaries = parsed.filter(
        (item): item is { threadId: string; title?: string; createdAt?: number } =>
          typeof item === "object" && item !== null && typeof (item as { threadId?: unknown }).threadId === "string",
      );
    }
  } catch {
    return;
  }

  const metadata: Array<Record<string, unknown>> = [];
  for (const summary of summaries) {
    let legacy: { messages?: LegacyMessage[]; updatedAt?: number };
    try {
      legacy = JSON.parse(storage.getItem(`${LEGACY_THREAD_PREFIX}${summary.threadId}`) || "{}") as typeof legacy;
    } catch {
      continue;
    }
    const messages = Array.isArray(legacy.messages) ? legacy.messages : [];
    let previousId: string | null = null;
    const repositoryMessages = messages.map((message, index) => {
      const id = message.id || `${summary.threadId}-message-${index}`;
      const content = typeof message.content === "string"
        ? [{ type: "text", text: message.content }]
        : Array.isArray(message.content) ? message.content : [];
      const base = {
        id,
        role: message.role || "user",
        content,
        createdAt: new Date((summary.createdAt || Date.now()) + index).toISOString(),
        metadata: { custom: {} },
      };
      if (base.role === "user") {
        const item = { message: { ...base, attachments: message.attachments || [] }, parentId: previousId };
        previousId = id;
        return item;
      }
      if (base.role === "assistant") {
        const item = { message: { ...base, status: { type: "complete" }, metadata: { ...base.metadata, unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [] } }, parentId: previousId };
        previousId = id;
        return item;
      }
      const item = { message: base, parentId: previousId };
      previousId = id;
      return item;
    });
    storage.setItem(`${STORAGE_PREFIX}messages:${summary.threadId}`, JSON.stringify({
      headId: repositoryMessages.at(-1)?.message.id || null,
      messages: repositoryMessages,
    }));
    metadata.push({
      remoteId: summary.threadId,
      status: "regular",
      title: summary.title,
    });
  }

  if (metadata.length > 0) {
    storage.setItem(`${STORAGE_PREFIX}threads`, JSON.stringify(metadata));
    const active = storage.getItem("h3-prompt-assistant-active-thread");
    storage.setItem(ACTIVE_THREAD_KEY, active || String(metadata[0].remoteId));
  }
}

function createBrowserStorage(): AsyncStorageLike {
  return {
    getItem: async (key) => {
      if (typeof globalThis.localStorage !== "undefined") {
        return globalThis.localStorage.getItem(key);
      }
      return memoryValues.get(key) ?? null;
    },
    setItem: async (key, value) => {
      if (typeof globalThis.localStorage !== "undefined") {
        globalThis.localStorage.setItem(key, value);
      } else {
        memoryValues.set(key, value);
      }
    },
    removeItem: async (key) => {
      if (typeof globalThis.localStorage !== "undefined") {
        globalThis.localStorage.removeItem(key);
      } else {
        memoryValues.delete(key);
      }
    },
  };
}

export function createH3ThreadListAdapter(
  storage: AsyncStorageLike = createBrowserStorage(),
): RemoteThreadListAdapter {
  if (typeof globalThis.localStorage !== "undefined") {
    migrateLegacyThreadStorage(globalThis.localStorage);
  }
  return createLocalStorageAdapter({
    storage,
    prefix: STORAGE_PREFIX,
  });
}

export { migrateLegacyThreadStorage };

export function getH3ActiveThreadId(): string | undefined {
  if (typeof globalThis.localStorage === "undefined") {
    return memoryValues.get(ACTIVE_THREAD_KEY) ?? undefined;
  }
  return globalThis.localStorage.getItem(ACTIVE_THREAD_KEY) ?? undefined;
}

export function setH3ActiveThreadId(threadId: string | undefined): void {
  if (typeof globalThis.localStorage === "undefined") {
    if (threadId) memoryValues.set(ACTIVE_THREAD_KEY, threadId);
    else memoryValues.delete(ACTIVE_THREAD_KEY);
    return;
  }
  if (threadId) globalThis.localStorage.setItem(ACTIVE_THREAD_KEY, threadId);
  else globalThis.localStorage.removeItem(ACTIVE_THREAD_KEY);
}
