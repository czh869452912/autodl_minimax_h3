import type { AppDatabase } from '../../storage/appDatabase';
import { withWriteTransaction } from '../../storage/sqliteBusy';
import { assertAppDatabaseWritableAsync } from '../../storage/database';
import { validateSkillPackage, type SkillPackage } from './package';

export type SkillVersion = SkillPackage & { createdAt: number; revocation: number; enabled: boolean; projectOverride?:boolean };
export type SkillSnapshot = { epoch: string; versions: Array<{ id: string; revocation: number }> };
type Row = { id: string; name: string; description: string; files_json: string; created_at: number; revocation: number; enabled?: number };
const listeners = new Set<(id: string) => void>();
export function onSkillRevoked(listener: (id: string) => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
function decode(row: Row): SkillVersion {
  const pkg = validateSkillPackage(JSON.parse(row.files_json));
  if (pkg.id !== row.id || pkg.name !== row.name || pkg.description !== row.description) throw new Error('技能版本内容校验失败');
  return { ...pkg, createdAt: row.created_at, revocation: row.revocation, enabled: !!row.enabled };
}

export function createSkillStore(db: AppDatabase) {
  return {
    async projectList(projectId:string):Promise<SkillVersion[]>{
      const overrides=await db.getAllAsync<{name:string;version_id:string|null}>('SELECT name,version_id FROM agent_skill_project_bindings WHERE project_id=?',projectId);
      return (await this.list()).map(v=>{const binding=overrides.find(b=>b.name===v.name);return {...v,projectOverride:!!binding,enabled:binding?binding.version_id===v.id:v.enabled};});
    },
    async setProjectVersion(projectId:string,name:string,versionId:string|null|undefined){
      await withWriteTransaction(db,async tx=>{
        if(!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',projectId))throw new Error('项目不可用');
        if(versionId!==null&&versionId!==undefined){
          const row=await tx.getFirstAsync<Row>('SELECT * FROM agent_skill_versions WHERE id=? AND name=?',versionId,name);
          if(!row)throw new Error('技能版本不存在');decode(row);
        }
        if(versionId===undefined)await tx.runAsync('DELETE FROM agent_skill_project_bindings WHERE project_id=? AND name=?',projectId,name);
        else await tx.runAsync('INSERT INTO agent_skill_project_bindings VALUES(?,?,?) ON CONFLICT(project_id,name) DO UPDATE SET version_id=excluded.version_id',projectId,name,versionId);
        const count=await tx.getFirstAsync<{n:number}>(`SELECT COUNT(*) AS n FROM agent_skill_versions v WHERE v.id IN (
          SELECT version_id FROM agent_skill_project_bindings WHERE project_id=? AND version_id IS NOT NULL
          UNION SELECT b.version_id FROM agent_skill_bindings b WHERE NOT EXISTS(SELECT 1 FROM agent_skill_project_bindings p WHERE p.project_id=? AND p.name=b.name))`,projectId,projectId);
        if((count?.n??0)>8)throw new Error('每个项目最多选用 8 个本地技能');
      });
    },
    async install(input: SkillPackage): Promise<string> {
      const pkg = validateSkillPackage(input.files);
      await assertAppDatabaseWritableAsync(db);
      await db.runAsync('INSERT OR IGNORE INTO agent_skill_versions(id,name,description,files_json,created_at,revocation) VALUES(?,?,?,?,?,0)', pkg.id, pkg.name, pkg.description, JSON.stringify(pkg.files), Date.now());
      return pkg.id;
    },
    async list(): Promise<SkillVersion[]> {
      return (await db.getAllAsync<Row>('SELECT v.*,b.version_id IS NOT NULL AS enabled FROM agent_skill_versions v LEFT JOIN agent_skill_bindings b ON b.version_id=v.id ORDER BY v.created_at DESC,v.id')).map(decode);
    },
    async enable(id: string): Promise<void> {
      await withWriteTransaction(db, async tx => {
        await assertAppDatabaseWritableAsync(tx);
        const row = await tx.getFirstAsync<Row>('SELECT * FROM agent_skill_versions WHERE id=?', id);
        if (!row) throw new Error('技能版本不存在');
        const version = decode(row);
        const count = await tx.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM agent_skill_bindings WHERE name!=?', version.name);
        if (Number(count?.count) >= 8) throw new Error('默认助手最多启用 8 个本地技能');
        await tx.runAsync('INSERT INTO agent_skill_bindings(name,version_id) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET version_id=excluded.version_id', version.name, id);
      });
    },
    async revoke(id: string): Promise<void> {
      await withWriteTransaction(db, async tx => {
        await assertAppDatabaseWritableAsync(tx);
        await tx.runAsync('DELETE FROM agent_skill_bindings WHERE version_id=?', id);
        await tx.runAsync('UPDATE agent_skill_project_bindings SET version_id=NULL WHERE version_id=?',id);
        await tx.runAsync('UPDATE agent_skill_versions SET revocation=revocation+1 WHERE id=?', id);
      });
      for (const listener of listeners) listener(id);
    },
    async capture(threadId: string, runId: string): Promise<SkillSnapshot> {
      return withWriteTransaction(db, async tx => {
        await assertAppDatabaseWritableAsync(tx);
        const deleted = await tx.getFirstAsync<{ deleted: number }>('SELECT deleted FROM agent_thread_index WHERE thread_id=?', threadId);
        if (deleted?.deleted) throw new Error('会话已删除，不能创建技能快照');
        const existing = await tx.getFirstAsync<{ snapshot_json: string }>('SELECT snapshot_json FROM agent_skill_runs WHERE thread_id=? AND run_id=?', threadId, runId);
        if (existing) return JSON.parse(existing.snapshot_json) as SkillSnapshot;
        const epoch = (await tx.getFirstAsync<{ epoch: string }>('SELECT epoch FROM creative_execution_state WHERE id=1'))?.epoch;
        if (!epoch) throw new Error('执行来源缺失');
        const scope=await tx.getFirstAsync<{project_id:string|null}>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?',threadId);
        const projectId=scope?.project_id??null;
        const versions = await tx.getAllAsync<{ id: string; revocation: number }>(`SELECT v.id,v.revocation FROM agent_skill_versions v WHERE v.id IN (
          SELECT version_id FROM agent_skill_project_bindings WHERE project_id=? AND version_id IS NOT NULL
          UNION SELECT b.version_id FROM agent_skill_bindings b WHERE NOT EXISTS(SELECT 1 FROM agent_skill_project_bindings p WHERE p.project_id=? AND p.name=b.name)) ORDER BY v.id`,projectId,projectId);
        if(versions.length>8)throw new Error('项目技能组合超过 8 个，请调整后重新运行');
        const snapshot = { epoch, versions };
        await tx.runAsync('INSERT INTO agent_skill_runs(thread_id,run_id,snapshot_json,created_at) VALUES(?,?,?,?)', threadId, runId, JSON.stringify(snapshot), Date.now());
        return snapshot;
      });
    },
    async resolve(snapshot: SkillSnapshot): Promise<SkillVersion[]> {
      const epoch = (await db.getFirstAsync<{ epoch: string }>('SELECT epoch FROM creative_execution_state WHERE id=1'))?.epoch;
      if (!snapshot || snapshot.epoch !== epoch || !Array.isArray(snapshot.versions) || snapshot.versions.length > 8) throw new Error('技能运行快照不可恢复，请开始新的运行');
      const versions: SkillVersion[] = [];
      for (const ref of snapshot.versions) {
        const row = await db.getFirstAsync<Row>('SELECT * FROM agent_skill_versions WHERE id=?', ref.id);
        if (!row || row.revocation !== ref.revocation) throw new Error('本次运行的技能已停用，请开始新的运行');
        versions.push(decode(row));
      }
      return versions;
    },
    async runs(): Promise<Array<{ threadId: string; runId: string; snapshot: SkillSnapshot }>> {
      const rows = await db.getAllAsync<{ thread_id: string; run_id: string; snapshot_json: string }>('SELECT * FROM agent_skill_runs ORDER BY created_at DESC LIMIT 20');
      return rows.map(row => ({ threadId: row.thread_id, runId: row.run_id, snapshot: JSON.parse(row.snapshot_json) }));
    },
  };
}
