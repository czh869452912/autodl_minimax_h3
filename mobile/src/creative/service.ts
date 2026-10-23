import CryptoJS from 'crypto-js';
import { z } from 'zod';
import type { AppDatabase } from '../storage/appDatabase';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { createId } from '../ids';
import type { AssetVersion, CommandResult, CreativeAsset, CreativeCommand, CreativeProject } from './types';

const id = z.string().min(1).max(200);
const title = z.string().trim().min(1).max(200);
const revision = z.number().int().nonnegative();
const schemas = {
  'project.create': z.object({ title, brief: z.string().max(20000).optional() }).strict(),
  'project.update': z.object({ id, expectedRevision: revision, title, brief: z.string().max(20000) }).strict(),
  'project.archive': z.object({ id, expectedRevision: revision, archived: z.boolean() }).strict(),
  'asset.import': z.object({ title, kind: z.enum(['image','video','audio','prompt','document']), blobSha256: z.string().regex(/^[a-f0-9]{64}$/), projectId: id.optional() }).strict(),
  'asset.setDefaultVersion': z.object({ id, versionId: id, expectedRevision: revision }).strict(),
  'asset.linkToProject': z.object({ assetId: id, projectId: id, versionId: id.nullable() }).strict(),
  'asset.unlinkFromProject': z.object({ assetId: id, projectId: id, expectedRevision: revision }).strict(),
};
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function changed(result: unknown) { if (Number((result as { changes?: number }).changes) !== 1) throw new Error('REVISION_CONFLICT'); }
type Row = Record<string, any>;
const project = (r: Row): CreativeProject => ({ id: r.id, title: r.title, brief: r.brief, revision: r.revision, archivedAt: r.archived_at ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at });
const asset = (r: Row): CreativeAsset => ({ id: r.id, title: r.title, kind: r.kind, currentVersionId: r.current_version_id ?? undefined, revision: r.revision, createdAt: r.created_at, updatedAt: r.updated_at });

export function createCreativeService(db: AppDatabase, deps = { id: createId, now: Date.now }) {
  const requireProject = async (tx: AppDatabase, projectId: string) => {
    if (!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL', projectId)) throw new Error('PROJECT_NOT_AVAILABLE');
  };
  const requireVersion = async (tx: AppDatabase, assetId: string, versionId: string) => {
    if (!await tx.getFirstAsync("SELECT v.id FROM creative_asset_versions v JOIN creative_version_files f ON f.version_id=v.id WHERE v.id=? AND v.asset_id=? AND f.role='original' AND f.state='AVAILABLE'", versionId, assetId)) throw new Error('VERSION_NOT_AVAILABLE');
  };
  return {
    async projects(archived = false): Promise<CreativeProject[]> { return (await db.getAllAsync<Row>('SELECT * FROM creative_projects WHERE (archived_at IS NOT NULL)=? ORDER BY updated_at DESC,id DESC', archived ? 1 : 0)).map(project); },
    async project(id: string) { const row = await db.getFirstAsync<Row>('SELECT * FROM creative_projects WHERE id=?', id); return row ? project(row) : undefined; },
    async assets(options: { projectId?: string; query?: string; inbox?: boolean } = {}): Promise<CreativeAsset[]> {
      const rows = await db.getAllAsync<Row>(`SELECT a.* FROM creative_assets a WHERE (? IS NULL OR EXISTS(SELECT 1 FROM creative_project_assets p WHERE p.asset_id=a.id AND p.project_id=?)) AND (?=0 OR NOT EXISTS(SELECT 1 FROM creative_project_assets p WHERE p.asset_id=a.id)) AND instr(lower(a.title),lower(?))>0 ORDER BY a.updated_at DESC,a.id DESC LIMIT 100`, options.projectId ?? null, options.projectId ?? null, options.inbox ? 1 : 0, options.query ?? '');
      return rows.map(asset);
    },
    async versions(assetId: string): Promise<AssetVersion[]> {
      return (await db.getAllAsync<Row>(`SELECT v.*,f.blob_sha256,f.state,b.relative_path,b.mime FROM creative_asset_versions v LEFT JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' LEFT JOIN artifact_blobs b ON b.sha256=f.blob_sha256 WHERE v.asset_id=? ORDER BY v.version_no DESC`, assetId)).map(r => ({ id: r.id, assetId: r.asset_id, versionNo: r.version_no, source: r.source, recipe: JSON.parse(r.recipe_json), blobSha256: r.blob_sha256 ?? undefined, relativePath: r.relative_path ?? undefined, mime: r.mime ?? undefined, state: r.state ?? 'PENDING' }));
    },
    async links(assetId: string) { return db.getAllAsync<{ project_id: string; title: string; pinned_version_id: string | null; revision: number }>('SELECT p.*,j.title FROM creative_project_assets p JOIN creative_projects j ON j.id=p.project_id WHERE asset_id=?', assetId); },
    async execute(command: CreativeCommand, key: string): Promise<CommandResult<Record<string, string>>> {
      id.parse(key);
      if (!(command.name in schemas)) throw new Error('UNKNOWN_CREATIVE_COMMAND');
      const payload = schemas[command.name].parse(command.payload);
      const hash = CryptoJS.SHA256(stable({ name: command.name, payload })).toString();
      return withWriteTransaction(db, async tx => {
        const old = await tx.getFirstAsync<{ payload_hash: string; result_json: string }>('SELECT * FROM creative_command_receipts WHERE idempotency_key=?', key);
        if (old) { if (old.payload_hash !== hash) throw new Error('IDEMPOTENCY_CONFLICT'); return JSON.parse(old.result_json); }
        const now = deps.now(); const p = payload as any;
        let value: Record<string, string>;
        switch (command.name) {
          case 'project.create': {
            const projectId = deps.id();
            await tx.runAsync('INSERT INTO creative_projects VALUES(?,?,?,0,NULL,?,?)', projectId, p.title, p.brief ?? '', now, now);
            value = { projectId }; break;
          }
          case 'project.update':
            changed(await tx.runAsync('UPDATE creative_projects SET title=?,brief=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?', p.title, p.brief, now, p.id, p.expectedRevision)); value = { projectId: p.id }; break;
          case 'project.archive':
            changed(await tx.runAsync('UPDATE creative_projects SET archived_at=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?', p.archived ? now : null, now, p.id, p.expectedRevision)); value = { projectId: p.id }; break;
          case 'asset.import': {
            if (p.projectId) await requireProject(tx, p.projectId);
            const blob = await tx.getFirstAsync<{ mime: string }>('SELECT mime FROM artifact_blobs WHERE sha256=?', p.blobSha256);
            if (!blob || (['image','video','audio'].includes(p.kind) && !blob.mime.startsWith(`${p.kind}/`))) throw new Error('ASSET_BLOB_INVALID');
            const assetId = deps.id(), versionId = deps.id();
            await tx.runAsync('INSERT INTO creative_assets VALUES(?,?,?,?,0,?,?)', assetId, p.kind, p.title, versionId, now, now);
            await tx.runAsync("INSERT INTO creative_asset_versions VALUES(?,?,1,'import','{}',?)", versionId, assetId, now);
            await tx.runAsync("INSERT INTO creative_version_files VALUES(?,'original',?,'AVAILABLE')", versionId, p.blobSha256);
            await tx.runAsync("INSERT INTO artifact_blob_refs VALUES(?,'creative_version',?,?)", p.blobSha256, versionId, now);
            if (p.projectId) await tx.runAsync('INSERT INTO creative_project_assets VALUES(?,?,?,0)', p.projectId, assetId, versionId);
            value = { assetId, versionId }; break;
          }
          case 'asset.setDefaultVersion':
            await requireVersion(tx, p.id, p.versionId);
            changed(await tx.runAsync('UPDATE creative_assets SET current_version_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?', p.versionId, now, p.id, p.expectedRevision)); value = { assetId: p.id, versionId: p.versionId }; break;
          case 'asset.linkToProject':
            await requireProject(tx, p.projectId);
            if (p.versionId) await requireVersion(tx, p.assetId, p.versionId);
            else if (!await tx.getFirstAsync('SELECT id FROM creative_assets WHERE id=?', p.assetId)) throw new Error('ASSET_NOT_FOUND');
            if (await tx.getFirstAsync('SELECT asset_id FROM creative_project_assets WHERE project_id=? AND asset_id=?', p.projectId, p.assetId)) throw new Error('PROJECT_ASSET_ALREADY_LINKED');
            await tx.runAsync('INSERT INTO creative_project_assets VALUES(?,?,?,0)', p.projectId, p.assetId, p.versionId); value = { assetId: p.assetId, projectId: p.projectId }; break;
          case 'asset.unlinkFromProject':
            changed(await tx.runAsync('DELETE FROM creative_project_assets WHERE project_id=? AND asset_id=? AND revision=?', p.projectId, p.assetId, p.expectedRevision)); value = { assetId: p.assetId, projectId: p.projectId }; break;
          default: throw new Error('UNKNOWN_CREATIVE_COMMAND');
        }
        const receiptId = deps.id(), originId = deps.id();
        const epoch = await tx.getFirstAsync<{ epoch: string }>('SELECT epoch FROM creative_execution_state WHERE id=1');
        if (!epoch) throw new Error('EXECUTION_EPOCH_MISSING');
        const lineage = await tx.getFirstAsync<{ namespace: string }>('SELECT namespace FROM creative_lineage WHERE id=1');
        if (!lineage) throw new Error('SOURCE_NAMESPACE_MISSING');
        await tx.runAsync("INSERT INTO creative_execution_origins VALUES(?,'user',?,NULL,NULL,NULL,?,?)", originId, lineage.namespace, command.name, now);
        const result: CommandResult<Record<string,string>> = { status: 'completed', receiptId, value };
        await tx.runAsync('INSERT INTO creative_command_receipts VALUES(?,?,?,?,?,?,?,?)', receiptId, key, command.name, hash, originId, epoch.epoch, JSON.stringify(result), now);
        return result;
      });
    },
  };
}
