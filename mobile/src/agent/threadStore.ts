import type { Message, State } from '@ag-ui/client';
import type { SQLiteDatabase } from 'expo-sqlite';
import { assertAppDatabaseWritableAsync } from '../storage/database';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { attachmentHashes, createAttachmentStore, validateImageBudget } from './attachmentStore';
import type { SubmissionCommand, SubmissionReceipt } from './submissionCommands';
import { endPromptRun, readPromptRuns } from './runState';
import CryptoJS from 'crypto-js';
import { recordFields, sameRecordFields } from './agentRecords';

export type LocalThreadSnapshot = {
  threadId: string; messages: Message[]; state: State; createdAt: number; updatedAt: number; customTitle?: string;
  summary?: { title: string; messageCount: number };
};
type IndexRow = { thread_id: string; created_at: number; updated_at: number; custom_title: string | null; title: string; message_count: number; last_run_json: string | null; read_at: number; deleted: number };
type LegacyRow = { thread_id: string; messages_json: string; state_json: string; created_at: number; updated_at: number; custom_title: string | null };
type PayloadRow = { id: string; sequence?: number; payload_json: string };
type RecordTable = 'agent_messages' | 'agent_runs' | 'agent_versions' | 'agent_workspaces';
const privateKeys = new Set(['apikey', 'authorization', 'credentials', 'endpoint', 'headers', 'llmapikey', 'llmendpoint', 'runtimeurl', 'token']);

export function sanitizePersistedValue(value: unknown, ancestors = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new Error('会话数据包含循环引用');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map(item => sanitizePersistedValue(item, ancestors));
    return Object.fromEntries(Object.entries(value).filter(([key]) => !privateKeys.has(key.replace(/[_-]/g, '').toLowerCase()))
      .map(([key, item]) => [key, sanitizePersistedValue(item, ancestors)]));
  } finally { ancestors.delete(value); }
}
function object(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function decode<T>(raw: string, validate: (value: unknown) => boolean): T {
  try { const value: unknown = JSON.parse(raw); if (validate(value)) return value as T; } catch { /* report a recoverable record error */ }
  throw new Error('本地会话数据损坏，原始记录已保留');
}
function records(value: unknown): Record<string, any>[] {
  if (!Array.isArray(value) || value.some(item => !object(item) || typeof item.id !== 'string' || !item.id)) throw new Error('本地会话记录损坏：缺少稳定 ID');
  if (new Set(value.map(item => item.id)).size !== value.length) throw new Error('本地会话记录损坏：ID 重复');
  return value;
}
function indexSnapshot(row: IndexRow): LocalThreadSnapshot {
  return { threadId: row.thread_id, messages: [], state: { ...(row.last_run_json ? { h3Runs: [decode(row.last_run_json, object)] } : {}), h3ReadAt: row.read_at },
    createdAt: row.created_at, updatedAt: row.updated_at, ...(row.custom_title ? { customTitle: row.custom_title } : {}), summary: { title: row.title, messageCount: row.message_count } };
}

export function createLocalThreadStore(db: SQLiteDatabase, attachments = createAttachmentStore(db)) {
  const durableFields = new Map<string, Map<string, unknown[]>>();
  const ownerId = (threadId: string, table: string, id: string) => JSON.stringify([threadId, table, id]);
  async function updateRefs(tx: SQLiteDatabase, threadId: string, table: string, id: string, value: unknown) {
    const owner = ownerId(threadId, table, id);
    await attachments.release(tx, 'agent_record', owner);
    await attachments.retain(tx, 'agent_record', owner, attachmentHashes(value));
  }
  async function writeRecords(tx: SQLiteDatabase, table: RecordTable, threadId: string, values: unknown) {
    const next = records(values);
    if (!next.length) return;
    let sequence = (await tx.getFirstAsync<{ next: number }>(`SELECT COALESCE(MAX(sequence),-1)+1 AS next FROM ${table} WHERE thread_id=?`, threadId))!.next;
    for (const item of next) {
      const json = JSON.stringify(sanitizePersistedValue(item));
      const old = await tx.getFirstAsync<PayloadRow>(`SELECT id,sequence,payload_json FROM ${table} WHERE thread_id=? AND id=?`, threadId, item.id);
      if (old?.payload_json === json) continue;
      if (table === 'agent_versions' && old) throw new Error('已确认版本不可修改，请恢复为新版本');
      await updateRefs(tx, threadId, table, item.id, item);
      await tx.runAsync(`INSERT INTO ${table}(thread_id,id,sequence,payload_json) VALUES(?,?,?,?) ON CONFLICT(thread_id,id) DO UPDATE SET payload_json=excluded.payload_json`, threadId, item.id, old?.sequence ?? sequence++, json);
    }
  }
  async function writeSnapshot(tx: SQLiteDatabase, snapshot: LocalThreadSnapshot) {
    await assertAppDatabaseWritableAsync(tx);
    const existing = await tx.getFirstAsync<IndexRow>('SELECT * FROM agent_thread_index WHERE thread_id=?', snapshot.threadId);
    if (existing?.deleted) throw new Error('会话已删除，拒绝迟到的更新');
    const messages = records(snapshot.messages);
    if (!object(snapshot.state)) throw new Error('会话状态损坏');
    const { h3Runs = [], h3Versions = [], h3Workspaces = [], h3Workspace, ...client } = snapshot.state as Record<string, unknown>;
    await writeRecords(tx, 'agent_messages', snapshot.threadId, messages);
    await writeRecords(tx, 'agent_runs', snapshot.threadId, h3Runs);
    await writeRecords(tx, 'agent_versions', snapshot.threadId, h3Versions);
    await writeRecords(tx, 'agent_workspaces', snapshot.threadId, h3Workspaces);
    const previous = new Map((await tx.getAllAsync<PayloadRow>('SELECT id,payload_json FROM agent_client_records WHERE thread_id=?', snapshot.threadId)).map(row => [row.id, row.payload_json]));
    for (const [id, value] of Object.entries(sanitizePersistedValue(client) as Record<string, unknown>)) {
      if (value === undefined) continue;
      const json = JSON.stringify(value);
      if (previous.get(id) !== json) {
        await updateRefs(tx, snapshot.threadId, 'agent_client_records', id, value);
        await tx.runAsync('INSERT INTO agent_client_records(thread_id,id,payload_json) VALUES(?,?,?) ON CONFLICT(thread_id,id) DO UPDATE SET payload_json=excluded.payload_json', snapshot.threadId, id, json);
      }
    }
    const user = messages.find(message => message.role === 'user');
    const title = snapshot.summary?.title ?? (typeof user?.content === 'string' ? user.content.slice(0, 40) : Array.isArray(user?.content) ? user.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ').slice(0, 40) : '');
    const lastRun = await tx.getFirstAsync<PayloadRow>('SELECT payload_json FROM agent_runs WHERE thread_id=? ORDER BY sequence DESC LIMIT 1', snapshot.threadId);
    await tx.runAsync('INSERT INTO agent_thread_index(thread_id,created_at,updated_at,custom_title,title,message_count,last_run_json,read_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(thread_id) DO UPDATE SET updated_at=MAX(updated_at,excluded.updated_at),custom_title=excluded.custom_title,title=excluded.title,message_count=excluded.message_count,last_run_json=excluded.last_run_json,read_at=excluded.read_at', snapshot.threadId, snapshot.createdAt, snapshot.updatedAt, snapshot.customTitle ?? existing?.custom_title ?? null, title || existing?.title || '', snapshot.summary?.messageCount ?? messages.filter(m => ['user', 'assistant'].includes(m.role)).length, lastRun?.payload_json ?? null, Number(client.h3ReadAt ?? existing?.read_at) || 0);
  }
  async function migrate(threadId: string) {
    const legacy = await db.getFirstAsync<LegacyRow>('SELECT * FROM agent_threads WHERE thread_id=?', threadId);
    if (!legacy) return;
    const snapshot: LocalThreadSnapshot = { threadId, messages: decode(legacy.messages_json, Array.isArray), state: decode(legacy.state_json, object), createdAt: legacy.created_at, updatedAt: legacy.updated_at, ...(legacy.custom_title ? { customTitle: legacy.custom_title } : {}) };
    snapshot.messages = snapshot.messages.map((message, index) => ({ ...message, id: message.id || `legacy-${CryptoJS.SHA256(`${threadId}:message:${index}`).toString()}` }));
    records(snapshot.messages);
    const users = snapshot.messages.filter(message => message.role === 'user');
    for (const run of readPromptRuns(snapshot.state)) {
      if (users.some(user => user.id === run.userMessageId)) continue;
      if (!run.userMessageId && users.length === 1) run.userMessageId = users[0].id;
      else throw new Error('旧会话运行来源损坏，原始记录已保留，请恢复关联后重试');
    }
    const stored = await attachments.externalize(snapshot);
    try { await withWriteTransaction(db, async tx => {
      const ready = await tx.getFirstAsync('SELECT thread_id FROM agent_thread_index WHERE thread_id=?', threadId);
      if (!ready) await writeSnapshot(tx, stored.value);
      await tx.runAsync('DELETE FROM agent_threads WHERE thread_id=?', threadId);
    }); } finally { await stored.releaseStaging(); }
  }
  const store = {
    async recoverInterruptedRuns(liveThreadIds: readonly string[]): Promise<void> {
      const live = new Set(liveThreadIds);
      await withWriteTransaction(db, async tx => {
        await assertAppDatabaseWritableAsync(tx);
        const rows = await tx.getAllAsync<PayloadRow & { thread_id: string }>('SELECT thread_id,id,payload_json FROM agent_runs');
        const changed = new Set<string>();
        for (const row of rows) {
          if (live.has(row.thread_id)) continue;
          const run = readPromptRuns({ h3Runs: [decode(row.payload_json, object)] })[0];
          if (!run || !['queued', 'running'].includes(run.status)) continue;
          const lastActivity = Math.max(run.startedAt, ...run.tools.map(tool => tool.endedAt ?? tool.startedAt));
          await tx.runAsync('UPDATE agent_runs SET payload_json=? WHERE thread_id=? AND id=?', JSON.stringify(endPromptRun(run, 'interrupted', lastActivity, '运行已中断，可重试这一轮')), row.thread_id, row.id);
          changed.add(row.thread_id);
        }
        for (const id of changed) {
          durableFields.delete(id);
          const latest = await tx.getFirstAsync<PayloadRow>('SELECT payload_json FROM agent_runs WHERE thread_id=? ORDER BY sequence DESC LIMIT 1', id);
          await tx.runAsync('UPDATE agent_thread_index SET last_run_json=? WHERE thread_id=?', latest?.payload_json ?? null, id);
        }
      });
    },
    async accept(snapshot: LocalThreadSnapshot, command: SubmissionCommand): Promise<SubmissionReceipt> {
      const prior = await db.getFirstAsync<{ thread_id: string; user_message_id: string; run_id: string }>('SELECT * FROM agent_submissions WHERE id=?', command.id);
      if (prior) {
        if (prior.thread_id !== snapshot.threadId || prior.user_message_id !== command.message.id || prior.run_id !== command.runId) throw new Error('提交标识冲突');
        return { submissionId: command.id, userMessageId: prior.user_message_id, runId: prior.run_id };
      }
      const stored = await attachments.externalize(snapshot);
      let message: Awaited<ReturnType<typeof attachments.externalize<typeof command.message>>> | undefined;
      try {
        message = await attachments.externalize(command.message);
        const acceptedMessage = message.value;
        return await withWriteTransaction(db, async tx => {
        await assertAppDatabaseWritableAsync(tx);
        const prior = await tx.getFirstAsync<{ thread_id: string; user_message_id: string; run_id: string }>('SELECT * FROM agent_submissions WHERE id=?', command.id);
        if (prior) {
          if (prior.thread_id !== snapshot.threadId || prior.user_message_id !== command.message.id || prior.run_id !== command.runId) throw new Error('提交标识冲突');
          return { submissionId: command.id, userMessageId: prior.user_message_id, runId: prior.run_id };
        }
        const submittedImages = (acceptedMessage as unknown as { attachments?: unknown }).attachments ?? [];
        if (!Array.isArray(submittedImages)) throw new Error('参考图片记录无效');
        const imageSizes: Array<{ size?: number }> = [];
        for (const image of submittedImages) {
          const hashes = attachmentHashes(object(image) ? image.source : undefined);
          const blob = hashes.length === 1 ? await tx.getFirstAsync<{ byte_size: number; mime: string }>('SELECT byte_size,mime FROM artifact_blobs WHERE sha256=?', hashes[0]) : null;
          imageSizes.push({ size: blob?.mime.startsWith('image/') ? Number(blob.byte_size) : undefined });
        }
        // Each attachment is a model image instance, even when its CAS hash is shared.
        validateImageBudget(imageSizes);
        const state = stored.value.state as Record<string, any>;
        const composer = state.h3Composer;
        const baseWorkspaceRevision = command.retryOf ? readPromptRuns(state).find(run => run.id === command.retryOf)?.baseWorkspaceRevision ?? 0 : Number(state.h3Workspace?.revision) || 0;
        const run = { id: command.runId, submissionId: command.id, userMessageId: command.message.id, status: 'queued', baseWorkspaceRevision, startedAt: Date.now(), messageIds: [], tools: [], ...(command.retryOf ? { retryOf: command.retryOf } : {}) };
        await writeSnapshot(tx, { ...stored.value, messages: command.retryOf ? stored.value.messages : [...stored.value.messages, acceptedMessage], state: { ...state, h3Runs: [...readPromptRuns(state), run], ...(composer?.revision === command.draftRevision && !command.retryOf ? { h3Composer: { text: '', attachments: [], revision: command.draftRevision + 1 } } : {}) }, updatedAt: Date.now() });
        await tx.runAsync('INSERT INTO agent_submissions VALUES(?,?,?,?,?)', command.id, snapshot.threadId, command.message.id, command.runId, command.draftRevision);
        return { submissionId: command.id, userMessageId: command.message.id, runId: command.runId };
      }); } finally { await stored.releaseStaging().catch(() => undefined); await message?.releaseStaging().catch(() => undefined); }
    },
    async load(threadId: string): Promise<LocalThreadSnapshot | null> {
      await migrate(threadId);
      const row = await db.getFirstAsync<IndexRow>('SELECT * FROM agent_thread_index WHERE thread_id=? AND deleted=0', threadId);
      if (!row) return null;
      const client = await db.getAllAsync<PayloadRow>('SELECT id,payload_json FROM agent_client_records WHERE thread_id=?', threadId);
      const values = async (table: RecordTable) => (await db.getAllAsync<PayloadRow>(`SELECT payload_json FROM ${table} WHERE thread_id=? ORDER BY sequence`, threadId)).map(item => decode<Record<string, any>>(item.payload_json, object));
      const state = Object.fromEntries(client.map(item => [item.id, decode(item.payload_json, () => true)]));
      const runs = await values('agent_runs'), versions = await values('agent_versions');
      const workspaces = await values('agent_workspaces');
      if (workspaces.length) { state.h3Workspaces = workspaces; state.h3Workspace = workspaces.at(-1); }
      if (runs.length) state.h3Runs = runs;
      if (versions.length) state.h3Versions = versions;
      const { summary: _summary, ...base } = indexSnapshot(row);
      return attachments.hydrate({ ...base, messages: await values('agent_messages') as Message[], state });
    },
    async latest(): Promise<LocalThreadSnapshot | null> { const first = (await store.listSummaries({ limit: 1 }))[0]; return first ? store.load(first.threadId) : null; },
    async list(): Promise<LocalThreadSnapshot[]> {
      const all: LocalThreadSnapshot[] = [];
      for (let offset = 0; ; offset += 200) {
        const page = await store.listSummaries({ limit: 200, offset });
        for (const row of page) { const loaded = await store.load(row.threadId); if (loaded) all.push(loaded); }
        if (page.length < 200) return all;
      }
    },
    async listSummaries(options: { limit?: number; offset?: number; query?: string } = {}): Promise<LocalThreadSnapshot[]> {
      const query = `%${(options.query ?? '').replace(/[\\%_]/g, '\\$&')}%`;
      const rows = await db.getAllAsync<IndexRow>("SELECT * FROM (SELECT * FROM agent_thread_index UNION ALL SELECT thread_id,created_at,updated_at,custom_title,'旧会话',0,NULL,0,0 FROM agent_threads l WHERE NOT EXISTS (SELECT 1 FROM agent_thread_index i WHERE i.thread_id=l.thread_id)) i WHERE deleted=0 AND (COALESCE(custom_title,title) LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM agent_messages m WHERE m.thread_id=i.thread_id AND m.payload_json LIKE ? ESCAPE '\\')) ORDER BY updated_at DESC,thread_id LIMIT ? OFFSET ?", query, query, Math.max(1, Math.min(options.limit ?? 50, 200)), Math.max(0, options.offset ?? 0));
      return rows.map(indexSnapshot);
    },
    async listMessages(threadId: string, options: { limit?: number; beforeSequence?: number } = {}): Promise<Message[]> {
      await migrate(threadId);
      return attachments.hydrate((await db.getAllAsync<PayloadRow>('SELECT payload_json FROM agent_messages WHERE thread_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?', threadId, options.beforeSequence ?? Number.MAX_SAFE_INTEGER, Math.max(1, Math.min(options.limit ?? 50, 200)))).reverse().map(row => decode<Message>(row.payload_json, object)));
    },
    async save(snapshot: LocalThreadSnapshot): Promise<void> {
      await migrate(snapshot.threadId);
      const previous = durableFields.get(snapshot.threadId);
      const fields = new Map<string, unknown[]>();
      const changed = (key: string, value: unknown) => { const next = recordFields(value); fields.set(key, next); return !sameRecordFields(previous?.get(key), next); };
      const messages = records(snapshot.messages).filter(item => changed(`message:${item.id}`, item));
      const state: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(snapshot.state ?? {})) {
        if (key === 'h3Workspace') continue;
        if (['h3Runs', 'h3Versions', 'h3Workspaces'].includes(key)) state[key] = records(value).filter(item => changed(`${key}:${item.id}`, item));
        else if (changed(key, value)) state[key] = value;
      }
      const user = snapshot.messages.find(message => message.role === 'user');
      const title = typeof user?.content === 'string' ? user.content.slice(0, 40) : '';
      const stored = await attachments.externalize({ ...snapshot, messages, state, summary: { title, messageCount: snapshot.messages.filter(m => ['user', 'assistant'].includes(m.role)).length } });
      try {
        await withWriteTransaction(db, tx => writeSnapshot(tx, stored.value as LocalThreadSnapshot));
        durableFields.delete(snapshot.threadId); durableFields.set(snapshot.threadId, fields);
        if (durableFields.size > 5) durableFields.delete(durableFields.keys().next().value!);
      }
      finally { await stored.releaseStaging(); }
    },
    async rename(threadId: string, title: string, updatedAt: number): Promise<void> {
      await migrate(threadId); await assertAppDatabaseWritableAsync(db);
      await db.runAsync('UPDATE agent_thread_index SET custom_title=?,updated_at=MAX(updated_at,?) WHERE thread_id=? AND deleted=0', title, updatedAt, threadId);
    },
    async remove(threadId: string): Promise<void> {
      durableFields.delete(threadId);
      await withWriteTransaction(db, async tx => {
        await assertAppDatabaseWritableAsync(tx);
        for (const table of ['agent_messages', 'agent_runs', 'agent_versions', 'agent_workspaces', 'agent_client_records']) {
          for (const row of await tx.getAllAsync<{ id: string }>(`SELECT id FROM ${table} WHERE thread_id=?`, threadId)) await attachments.release(tx, 'agent_record', ownerId(threadId, table, row.id));
          await tx.runAsync(`DELETE FROM ${table} WHERE thread_id=?`, threadId);
        }
        await tx.runAsync('DELETE FROM agent_threads WHERE thread_id=?', threadId);
        await tx.runAsync('DELETE FROM agent_submissions WHERE thread_id=?', threadId);
        await tx.runAsync('INSERT INTO agent_thread_index(thread_id,created_at,updated_at,deleted) VALUES(?,?,?,1) ON CONFLICT(thread_id) DO UPDATE SET deleted=1', threadId, Date.now(), Date.now());
      });
    },
  };
  return store;
}
export type LocalThreadStore = ReturnType<typeof createLocalThreadStore>;
