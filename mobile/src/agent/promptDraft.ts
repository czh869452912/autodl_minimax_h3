import type { SQLiteDatabase } from 'expo-sqlite';
import { assertAppDatabaseWritableAsync, getAppRecoveryState } from '../storage/database';
import { decodePromptHandoff, type PromptHandoff } from './promptHandoff';
import { attachmentHashes, createAttachmentStore } from './attachmentStore';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { createAgentId } from './submissionCommands';
import type { TaskMediaInput } from '../tasks/types';

const MAX_AGE = 60 * 60 * 1000;
export type AppliedPromptForm = {
  workflowId: string;
  values: Record<string, unknown>;
  images: TaskMediaInput[];
  audios: TaskMediaInput[];
  revision: number;
};
export type PromptDraft = {
  id: string;
  prompt: string;
  attachmentIds: string[];
  handoff?: PromptHandoff;
  createdAt: number;
  status?: 'ready' | 'applied' | 'submitted' | 'discarded' | 'expired';
  form?: AppliedPromptForm;
};

function parse(
  row: {
    id: string;
    prompt: string;
    attachment_ids_json: string;
    created_at: number;
  } | null,
): PromptDraft | null {
  if (!row) return null;
  let attachmentIds: string[] = [];
  let value: unknown;
  let handoff: PromptHandoff | undefined;
  try {
    value = JSON.parse(row.attachment_ids_json);
    if (Array.isArray(value))
      attachmentIds = value.filter(
        (item): item is string => typeof item === 'string',
      );
  } catch {
    throw new Error('提示词交接数据损坏，请重新导出');
  }
  if (!value || typeof value !== 'object') throw new Error('提示词交接数据损坏，请重新导出');
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const envelope = value as Record<string, unknown>;
    if (envelope.version !== 1 || !Array.isArray(envelope.attachmentIds) || envelope.attachmentIds.some((id) => typeof id !== 'string')) throw new Error('提示词交接数据损坏，请重新导出');
    attachmentIds = envelope.attachmentIds;
    handoff = decodePromptHandoff(envelope.handoff);
    if (handoff.prompt !== row.prompt) throw new Error('提示词交接内容不一致，请重新导出');
  }
  return {
    id: row.id,
    prompt: row.prompt,
    attachmentIds,
    ...(handoff ? { handoff } : {}),
    createdAt: Number(row.created_at),
  };
}

export function createPromptDraftStore(
  db: SQLiteDatabase,
  now = () => Date.now(),
  assets = createAttachmentStore(db),
) {
  type Row = { id: string; payload_json: string; status: NonNullable<PromptDraft['status']>; created_at: number };
  const decode = (row: Row): PromptDraft => {
    let value: PromptDraft;
    try { value = JSON.parse(row.payload_json); } catch { throw new Error('提示词交接数据损坏，请重新导出'); }
    if (!value || value.id !== row.id || typeof value.prompt !== 'string' || !Array.isArray(value.attachmentIds) || value.attachmentIds.some(id => typeof id !== 'string')) throw new Error('提示词交接数据损坏，请重新导出');
    if (value.handoff) { decodePromptHandoff(value.handoff); if (value.handoff.prompt !== value.prompt) throw new Error('提示词交接内容不一致，请重新导出'); }
    if (value.form && (typeof value.form.workflowId !== 'string' || !value.form.values || typeof value.form.values !== 'object' || !Array.isArray(value.form.images) || !Array.isArray(value.form.audios) || !Number.isSafeInteger(value.form.revision) || value.form.revision < 0)) throw new Error('已保存表单损坏，请重新导出');
    return { ...value, status: row.status, createdAt: row.created_at };
  };
  const persist = async (draft: PromptDraft, legacy = false) => {
    await assertAppDatabaseWritableAsync(db);
    if (draft.handoff) { decodePromptHandoff(draft.handoff); if (draft.handoff.prompt !== draft.prompt) throw new Error('提示词交接内容不一致，请重新导出'); }
    const staged = await assets.externalize(draft);
    try {
      await withWriteTransaction(db, async tx => {
        await assertAppDatabaseWritableAsync(tx);
        const inserted = await tx.runAsync('INSERT OR IGNORE INTO agent_handoffs(id,payload_json,status,created_at) VALUES(?,?,?,?)', draft.id, JSON.stringify(staged.value), 'ready', draft.createdAt);
        if (inserted.changes) await assets.retain(tx, 'agent_handoff', draft.id, staged.hashes);
        if (legacy) await tx.runAsync('DELETE FROM prompt_drafts WHERE id=?', draft.id);
      });
    } finally { await staged.releaseStaging(); }
    return assets.hydrate({ ...staged.value, status: 'ready' as const });
  };
  return {
    async save(
      input: Pick<PromptDraft, 'prompt' | 'attachmentIds' | 'handoff'>,
    ): Promise<PromptDraft> {
      const draft: PromptDraft = {
        id: `draft-${createAgentId()}`,
        prompt: input.prompt,
        attachmentIds: input.attachmentIds,
        ...(input.handoff ? { handoff: input.handoff } : {}),
        createdAt: now(),
      };
      return persist(draft);
    },
    async read(id: string): Promise<PromptDraft | null> {
      let row = await db.getFirstAsync<Row>('SELECT * FROM agent_handoffs WHERE id=?', id);
      if (!row) {
        const legacy = parse(await db.getFirstAsync<{
          id: string;
          prompt: string;
          attachment_ids_json: string;
          created_at: number;
        }>('SELECT * FROM prompt_drafts WHERE id = ? LIMIT 1', id));
        if (!legacy) return null;
        if (getAppRecoveryState(db)) return legacy;
        await persist(legacy, true);
        row = (await db.getFirstAsync<Row>('SELECT * FROM agent_handoffs WHERE id=?', id))!;
      }
      if (!['ready', 'applied'].includes(row.status)) return null;
      if (row.status === 'ready' && row.created_at < now() - MAX_AGE) {
        if (!getAppRecoveryState(db)) await withWriteTransaction(db, async tx => {
          await assertAppDatabaseWritableAsync(tx);
          const expired = await tx.runAsync("UPDATE agent_handoffs SET status='expired' WHERE id=? AND status='ready'", id);
          if (expired.changes) await assets.release(tx, 'agent_handoff', id);
        });
        return null;
      }
      return assets.hydrate(decode(row));
    },
    async consume(id: string): Promise<PromptDraft | null> {
      if (!await this.read(id)) return null;
      await withWriteTransaction(db, async tx => {
        await assertAppDatabaseWritableAsync(tx);
        const row = await tx.getFirstAsync<Row>('SELECT * FROM agent_handoffs WHERE id=?', id);
        if (!row || row.status !== 'ready') return;
        await assets.retain(tx, 'create_form', id, attachmentHashes(decode(row)));
        await tx.runAsync("UPDATE agent_handoffs SET status='applied' WHERE id=?", id);
        await assets.release(tx, 'agent_handoff', id);
      });
      return this.read(id);
    },
    async discard(id: string): Promise<void> {
      await withWriteTransaction(db, async tx => {
        await assertAppDatabaseWritableAsync(tx);
        const changed = await tx.runAsync("UPDATE agent_handoffs SET status='discarded' WHERE id=? AND status IN ('ready','applied')", id);
        if (changed.changes) {
          await assets.release(tx, 'agent_handoff', id);
          await assets.release(tx, 'create_form', id);
        }
      });
    },
    async saveForm(id: string, form: AppliedPromptForm): Promise<void> {
      const staged = await assets.externalize(form.images);
      try {
        await withWriteTransaction(db, async tx => {
          await assertAppDatabaseWritableAsync(tx);
          const row = await tx.getFirstAsync<Row>('SELECT * FROM agent_handoffs WHERE id=?', id);
          if (!row || row.status !== 'applied') return;
          const current = decode(row);
          if (current.form && current.form.revision >= form.revision) return;
          const next = { ...current, form: { ...form, images: staged.value } };
          await assets.release(tx, 'create_form', id);
          await assets.retain(tx, 'create_form', id, attachmentHashes(next));
          await tx.runAsync('UPDATE agent_handoffs SET payload_json=? WHERE id=?', JSON.stringify(next), id);
        });
      } finally { await staged.releaseStaging(); }
    },
  };
}
