import type { AppDatabase } from '../storage/appDatabase';
import { withWriteTransaction } from '../storage/sqliteBusy';

/** Bind only a new/unscoped conversation; never silently move existing work. */
export async function bindProjectConversation(db: AppDatabase, threadId: string, projectId: string) {
  await withWriteTransaction(db, async tx => {
    if (!await tx.getFirstAsync('SELECT thread_id FROM agent_thread_index WHERE thread_id=? AND deleted=0', threadId)) throw new Error('对话不存在');
    if (!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL', projectId)) throw new Error('项目已归档或不存在');
    const scope = await tx.getFirstAsync<{project_id:string|null}>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?', threadId);
    if (scope && scope.project_id !== projectId) throw new Error('此对话属于其他项目，请新建对话');
    await tx.runAsync('INSERT INTO creative_agent_scopes(thread_id,project_id,revision,updated_at) VALUES(?,?,0,?) ON CONFLICT(thread_id) DO NOTHING', threadId, projectId, Date.now());
  });
}
