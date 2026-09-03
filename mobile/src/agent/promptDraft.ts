import type { SQLiteDatabase } from 'expo-sqlite';
import { assertAppDatabaseWritable, getAppRecoveryState } from '../storage/database';

const MAX_AGE = 60 * 60 * 1000;
export type PromptDraft = {
  id: string;
  prompt: string;
  attachmentIds: string[];
  createdAt: number;
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
  try {
    const value = JSON.parse(row.attachment_ids_json);
    if (Array.isArray(value))
      attachmentIds = value.filter(
        (item): item is string => typeof item === 'string',
      );
  } catch {
    /* keep empty */
  }
  return {
    id: row.id,
    prompt: row.prompt,
    attachmentIds,
    createdAt: Number(row.created_at),
  };
}

export function createPromptDraftStore(
  db: SQLiteDatabase,
  now = () => Date.now(),
) {
  const purge = () => {
    if (getAppRecoveryState(db)) return;
    db.runSync(
      'DELETE FROM prompt_drafts WHERE created_at < ?',
      now() - MAX_AGE,
    );
  };
  return {
    async save(
      input: Pick<PromptDraft, 'prompt' | 'attachmentIds'>,
    ): Promise<PromptDraft> {
      assertAppDatabaseWritable(db);
      const draft: PromptDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        prompt: input.prompt,
        attachmentIds: input.attachmentIds,
        createdAt: now(),
      };
      db.runSync(
        'INSERT OR REPLACE INTO prompt_drafts (id,prompt,attachment_ids_json,created_at) VALUES (?,?,?,?)',
        draft.id,
        draft.prompt,
        JSON.stringify(draft.attachmentIds),
        draft.createdAt,
      );
      return draft;
    },
    async read(id: string): Promise<PromptDraft | null> {
      purge();
      return parse(
        db.getFirstSync<{
          id: string;
          prompt: string;
          attachment_ids_json: string;
          created_at: number;
        }>('SELECT * FROM prompt_drafts WHERE id = ? LIMIT 1', id),
      );
    },
    async consume(id: string): Promise<PromptDraft | null> {
      const draft = await this.read(id);
      if (draft) {
        assertAppDatabaseWritable(db);
        db.runSync('DELETE FROM prompt_drafts WHERE id = ?', id);
      }
      return draft;
    },
  };
}
