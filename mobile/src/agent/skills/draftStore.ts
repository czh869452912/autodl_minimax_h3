import type { AppDatabase } from '../../storage/appDatabase';
import { assertAppDatabaseWritableAsync } from '../../storage/database';
import { withWriteTransaction } from '../../storage/sqliteBusy';
import { createId } from '../../ids';
import { validateSkillPackage } from './package';
import { DRAFT_LIMIT, EVIDENCE_LIMIT, redactSkillEvidence } from './extraction';

export type SkillDraft = { id: string; revision: number; goal: string; evidence: string; content: string; publishedVersion: string | null; updatedAt: number };
type Row = { id: string; revision: number; goal: string; evidence: string; content: string; published_version: string | null; updated_at: number };
const decode = (row: Row): SkillDraft => ({ id: row.id, revision: row.revision, goal: row.goal, evidence: row.evidence, content: row.content, publishedVersion: row.published_version, updatedAt: row.updated_at });

export function createSkillDraftStore(db: AppDatabase) {
  return {
    async list(): Promise<SkillDraft[]> {
      return (await db.getAllAsync<Row>('SELECT * FROM agent_skill_drafts ORDER BY updated_at DESC,id LIMIT 50')).map(decode);
    },
    async save(input: Pick<SkillDraft, 'goal' | 'evidence' | 'content'>, previous?: SkillDraft): Promise<SkillDraft> {
      if (!input.goal.trim() || input.goal.length > 500 || !input.evidence.trim() || input.evidence.length > EVIDENCE_LIMIT || input.content.length > DRAFT_LIMIT) throw new Error('草稿目标、证据或正文超出允许范围');
      if (Object.values(input).some(text => redactSkillEvidence(text) !== text)) throw new Error('草稿仍含可识别的敏感信息，请重新脱敏后检查');
      return withWriteTransaction(db, async tx => {
        await assertAppDatabaseWritableAsync(tx);
        const id = previous?.id ?? createId(), at = Date.now();
        if (previous) {
          const changed = await tx.runAsync('UPDATE agent_skill_drafts SET goal=?,evidence=?,content=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND published_version IS NULL', input.goal, input.evidence, input.content, at, id, previous.revision);
          if (!changed.changes) throw new Error('草稿已更新、发布或删除，请重新打开');
        } else await tx.runAsync('INSERT INTO agent_skill_drafts(id,revision,goal,evidence,content,created_at,updated_at) VALUES(?,0,?,?,?,?,?)', id, input.goal, input.evidence, input.content, at, at);
        return decode((await tx.getFirstAsync<Row>('SELECT * FROM agent_skill_drafts WHERE id=?', id))!);
      });
    },
    async publish(reviewed: SkillDraft): Promise<string> {
      const pkg = validateSkillPackage({ 'SKILL.md': reviewed.content });
      if (redactSkillEvidence(reviewed.content) !== reviewed.content) throw new Error('请先移除草稿中的敏感信息');
      return withWriteTransaction(db, async tx => {
        await assertAppDatabaseWritableAsync(tx);
        const row = await tx.getFirstAsync<Row>('SELECT * FROM agent_skill_drafts WHERE id=?', reviewed.id);
        if (!row || row.revision !== reviewed.revision || row.content !== reviewed.content) throw new Error('草稿已改变，请重新审阅');
        if (row.published_version) return row.published_version;
        await tx.runAsync('INSERT OR IGNORE INTO agent_skill_versions(id,name,description,files_json,created_at,revocation) VALUES(?,?,?,?,?,0)', pkg.id, pkg.name, pkg.description, JSON.stringify(pkg.files), Date.now());
        await tx.runAsync('UPDATE agent_skill_drafts SET published_version=?,updated_at=? WHERE id=?', pkg.id, Date.now(), row.id);
        return pkg.id;
      });
    },
    async remove(draft: SkillDraft): Promise<void> {
      await assertAppDatabaseWritableAsync(db);
      const result = await db.runAsync('DELETE FROM agent_skill_drafts WHERE id=? AND revision=?', draft.id, draft.revision);
      if (!result.changes) throw new Error('草稿已改变，请刷新后重试');
    },
  };
}
