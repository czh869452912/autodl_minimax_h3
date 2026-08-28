import type { ThreadMessageLike } from "@assistant-ui/react";

const LEGACY_STORAGE_KEY = "h3-prompt-assistant-thread";
const STORAGE_INDEX_KEY = "h3-prompt-assistant-threads-index";
const STORAGE_THREAD_PREFIX = "h3-prompt-assistant-thread:";
const STORAGE_ACTIVE_KEY = "h3-prompt-assistant-active-thread";
const VERSION = 1;

export type StoredThreadSummary = {
  threadId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
};

export type StoredThread = {
  version: 1;
  threadId: string;
  title?: string;
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

export function extractThreadTitle(messages: ThreadMessageLike[]): string {
  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string" && msg.content.trim()) {
        return msg.content.trim().slice(0, 24);
      }
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
            const text = ((part as { text: string }).text || "").trim();
            if (text) return text.slice(0, 24);
          }
        }
      }
    }
  }
  return "新对话";
}

export function createNewThreadId(): string {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getActiveThreadId(): string {
  const active = storage().getItem(STORAGE_ACTIVE_KEY);
  if (active) return active;
  const list = listThreads();
  if (list.length > 0) {
    return list[0].threadId;
  }
  return "h3-prompt-assistant";
}

export function setActiveThreadId(threadId: string): void {
  storage().setItem(STORAGE_ACTIVE_KEY, threadId);
}

export function listThreads(): StoredThreadSummary[] {
  let raw: string | null = null;
  try {
    raw = storage().getItem(STORAGE_INDEX_KEY);
  } catch {
    return [];
  }
  if (!raw) {
    // Check legacy single thread for migration
    const legacy = loadLegacyThread();
    if (legacy) {
      const summary: StoredThreadSummary = {
        threadId: legacy.threadId,
        title: extractThreadTitle(legacy.messages),
        updatedAt: legacy.updatedAt || Date.now(),
        messageCount: legacy.messages.length,
      };
      saveThreadIndex([summary]);
      saveThreadToKey(legacy.threadId, legacy);
      return [summary];
    }
    return [];
  }

  try {
    const list = JSON.parse(raw) as StoredThreadSummary[];
    if (!Array.isArray(list)) return [];
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function saveThreadIndex(index: StoredThreadSummary[]): void {
  try {
    storage().setItem(STORAGE_INDEX_KEY, JSON.stringify(index));
  } catch {
    // Ignore storage write error for index
  }
}

function saveThreadToKey(threadId: string, record: StoredThread): void {
  storage().setItem(`${STORAGE_THREAD_PREFIX}${threadId}`, JSON.stringify(record));
}

function loadLegacyThread(): StoredThread | null {
  try {
    const raw = storage().getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw.replace(/^\uFEFF/, "").trim()) as Partial<StoredThread>;
    if (value.version !== VERSION || typeof value.threadId !== "string" || !Array.isArray(value.messages)) {
      throw new Error("invalid schema");
    }
    return {
      version: VERSION,
      threadId: value.threadId,
      title: value.title || extractThreadTitle(value.messages),
      messages: value.messages,
      finalPrompt: typeof value.finalPrompt === "string" ? value.finalPrompt : null,
      updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
    };
  } catch {
    try {
      storage().removeItem(LEGACY_STORAGE_KEY);
    } catch {}
    return null;
  }
}

export function saveThread(input: Pick<StoredThread, "threadId" | "messages"> & { title?: string; finalPrompt?: string | null }): void {
  const sanitizedMessages = input.messages.map(sanitizeMessage);
  const title = input.title || extractThreadTitle(sanitizedMessages);
  const now = Date.now();

  const record: StoredThread = {
    version: VERSION,
    threadId: input.threadId,
    title,
    messages: sanitizedMessages,
    finalPrompt: input.finalPrompt ?? null,
    updatedAt: now,
  };

  try {
    saveThreadToKey(input.threadId, record);
    // Also save legacy key for backward compatibility
    storage().setItem(LEGACY_STORAGE_KEY, JSON.stringify(record));
    storage().setItem(STORAGE_ACTIVE_KEY, input.threadId);

    // Update index
    const currentList = listThreads().filter((t) => t.threadId !== input.threadId);
    currentList.unshift({
      threadId: input.threadId,
      title,
      updatedAt: now,
      messageCount: sanitizedMessages.length,
    });
    saveThreadIndex(currentList);
  } catch (error) {
    throw new Error(`thread storage write failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function loadThread(threadId?: string): StoredThread | null {
  const targetId = threadId || getActiveThreadId();
  let raw: string | null = null;
  try {
    raw = storage().getItem(`${STORAGE_THREAD_PREFIX}${targetId}`);
  } catch {
    // fallback
  }

  if (!raw) {
    const legacy = loadLegacyThread();
    if (legacy && (!threadId || legacy.threadId === threadId)) {
      return legacy;
    }
    return null;
  }

  try {
    const value = JSON.parse(raw.replace(/^\uFEFF/, "").trim()) as Partial<StoredThread>;
    if (value.version !== VERSION || typeof value.threadId !== "string" || !Array.isArray(value.messages)) {
      throw new Error("invalid schema");
    }
    return {
      version: VERSION,
      threadId: value.threadId,
      title: value.title || extractThreadTitle(value.messages),
      messages: value.messages,
      finalPrompt: typeof value.finalPrompt === "string" ? value.finalPrompt : null,
      updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
    };
  } catch {
    try {
      storage().removeItem(`${STORAGE_THREAD_PREFIX}${targetId}`);
    } catch {}
    return null;
  }
}

export function deleteThread(threadId: string): void {
  try {
    storage().removeItem(`${STORAGE_THREAD_PREFIX}${threadId}`);
    const updated = listThreads().filter((t) => t.threadId !== threadId);
    saveThreadIndex(updated);
    if (getActiveThreadId() === threadId) {
      const nextId = updated.length > 0 ? updated[0].threadId : "h3-prompt-assistant";
      setActiveThreadId(nextId);
    }
  } catch {}
}

