import type { Message, State } from '@ag-ui/client';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ensureAppDatabase } from '../storage/database';

const schema = `CREATE TABLE IF NOT EXISTS agent_threads (
  thread_id TEXT PRIMARY KEY NOT NULL,
  messages_json TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  custom_title TEXT
);`;

const privateKeys = new Set([
  'apikey',
  'authorization',
  'credentials',
  'endpoint',
  'headers',
  'llmapikey',
  'llmendpoint',
  'runtimeurl',
  'token',
]);

export type LocalThreadSnapshot = {
  threadId: string;
  messages: Message[];
  state: State;
  createdAt: number;
  updatedAt: number;
  customTitle?: string;
};

type ThreadRow = {
  thread_id: string;
  messages_json: string;
  state_json: string;
  created_at: number;
  updated_at: number;
  custom_title?: string | null;
};

/** Keep persisted chat data independent from credentials and transport config. */
export function sanitizePersistedValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePersistedValue(item, seen))
      .filter((item) => item !== undefined);
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (privateKeys.has(key.replace(/[_-]/g, '').toLowerCase())) continue;
    const next = sanitizePersistedValue(item, seen);
    if (next !== undefined) sanitized[key] = next;
  }
  return sanitized;
}

function parseJson<T>(source: string, fallback: T): T {
  try {
    return JSON.parse(source) as T;
  } catch {
    return fallback;
  }
}

function mapRow(row: ThreadRow | null): LocalThreadSnapshot | null {
  if (!row) return null;
  return {
    threadId: row.thread_id,
    messages: parseJson<Message[]>(row.messages_json, []),
    state: parseJson<State>(row.state_json, {}),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    ...(row.custom_title ? { customTitle: row.custom_title } : {}),
  };
}

export function createLocalThreadStore(db: SQLiteDatabase) {
  ensureAppDatabase(db);
  db.execSync(schema);
  return {
    async load(threadId: string): Promise<LocalThreadSnapshot | null> {
      return mapRow(
        await db.getFirstAsync<ThreadRow>(
          'SELECT * FROM agent_threads WHERE thread_id = ? LIMIT 1',
          threadId,
        ),
      );
    },
    async latest(): Promise<LocalThreadSnapshot | null> {
      return mapRow(
        await db.getFirstAsync<ThreadRow>(
          'SELECT * FROM agent_threads ORDER BY updated_at DESC LIMIT 1',
        ),
      );
    },
    async list(): Promise<LocalThreadSnapshot[]> {
      return (
        await db.getAllAsync<ThreadRow>(
          'SELECT * FROM agent_threads ORDER BY updated_at DESC',
        ) ?? []
      ).map((row) => mapRow(row)!);
    },
    async save(snapshot: LocalThreadSnapshot): Promise<void> {
      await db.runAsync(
        'INSERT OR REPLACE INTO agent_threads (thread_id,messages_json,state_json,created_at,updated_at,custom_title) VALUES (?,?,?,?,?,?)',
        snapshot.threadId,
        JSON.stringify(sanitizePersistedValue(snapshot.messages)),
        JSON.stringify(sanitizePersistedValue(snapshot.state)),
        snapshot.createdAt,
        snapshot.updatedAt,
        snapshot.customTitle ?? null,
      );
    },
    async remove(threadId: string): Promise<void> {
      await db.runAsync('DELETE FROM agent_threads WHERE thread_id = ?', threadId);
    },
  };
}

export type LocalThreadStore = ReturnType<typeof createLocalThreadStore>;
