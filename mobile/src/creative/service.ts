import {readUsageGraph} from './usageGraph';
import { importedOriginals } from './importIdentity';
import {enqueueVersionExport} from './enqueueVersionExport';
import {readResultHistoryPage} from './resultHistory';
import {readVideoHistory} from './videoHistory';
import {readCreationRecords,readCreationRecordPage,type CreationQuery} from './creationRecords';
import CryptoJS from 'crypto-js';
import { recoverNovelAiMetadata } from './novelAiMetadata';
import { storySchemas, applyStoryCommand, listCreativeShots } from './story';
import { draftSchemas, applyDraftCommand, readCreativeDraft, readDraftInputs } from './drafts';
import { z } from 'zod';
import { guardCreativeAgentCommand, type CreativeAgentOrigin } from './agentScope';
import { lifecycleSchemas,applyAssetLifecycle } from './assetLifecycle';
import { planSchemas,applyPlanCommand } from './plans';
import { CREATIVE_FILE_MIMES,creativeExportTarget } from './fileFormats';
import { authoredTextSchemas,applyAuthoredText } from './authoredText';
import { reviewSchemas,proposeCreativeChange,resolveCreativeChange } from './changeReview';
import type { AppDatabase } from '../storage/appDatabase';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { createId } from '../ids';
import type { AssetVersion, AsyncExecutionRef, CommandResult, CreativeAsset, CreativeCommand, CreativeProject } from './types';
import { insertWorkflowOperation } from '../workflows/executor/operationInsert';

const id = z.string().min(1).max(200);
const title = z.string().trim().min(1).max(200);
const revision = z.number().int().nonnegative();
const schemas = {
  ...reviewSchemas,
  ...authoredTextSchemas,
  ...planSchemas,
  ...lifecycleSchemas,
  ...storySchemas,
  ...draftSchemas,
  'asset.export': z.object({ versionId: id, generation: z.number().int().positive().default(1) }).strict(),
  'project.create': z.object({ title, brief: z.string().max(20000).optional() }).strict(),
  'project.update': z.object({ id, expectedRevision: revision, title, brief: z.string().max(20000) }).strict(),
  'project.archive': z.object({ id, expectedRevision: revision, archived: z.boolean() }).strict(),
  'project.setCover':z.object({id,expectedRevision:revision,versionId:id.nullable()}).strict(),
  'asset.import': z.object({ title, kind: z.enum(['image','video','audio','prompt','document']), blobSha256: z.string().regex(/^[a-f0-9]{64}$/), projectId: id.optional(), metadata: z.record(z.string().max(100),z.string().max(524288)).refine(value=>JSON.stringify(value).length<=524288).optional(), sourceUri: z.string().max(4000).regex(/^(file|content):\/\//).optional() }).strict(),
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
    if (!await tx.getFirstAsync("SELECT v.id FROM creative_asset_versions v JOIN creative_version_files f ON f.version_id=v.id WHERE v.id=? AND v.asset_id=? AND NOT EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=v.asset_id) AND f.role='original' AND f.state='AVAILABLE'", versionId, assetId)) throw new Error('VERSION_NOT_AVAILABLE');
  };
  return {
    resultHistoryPage: (options: Parameters<typeof readResultHistoryPage>[1]) => readResultHistoryPage(db,options),
    videoHistory: (draft: Parameters<typeof readVideoHistory>[1],options?:Parameters<typeof readVideoHistory>[2]) => readVideoHistory(db,draft,options),
    shots: (projectId: string) => listCreativeShots(db, projectId),
    draft: (id: string) => readCreativeDraft(db, id),
    creationRecordPage: (options?:CreationQuery) => readCreationRecordPage(db,options),
    creationRecords: (options?:CreationQuery) => readCreationRecords(db,options),
    draftInputs: (id: string) => readDraftInputs(db, id),
    drafts: (projectId?: string) => db.getAllAsync<import('./drafts').CreativeDraft>("SELECT d.*,EXISTS(SELECT 1 FROM creative_draft_inputs i WHERE i.draft_id=d.id) AS has_inputs FROM creative_generation_drafts d WHERE (? IS NULL OR project_id=?) AND state!='DISCARDED' ORDER BY updated_at DESC,id DESC LIMIT 100", projectId ?? null, projectId ?? null),
    async projects(archived = false): Promise<CreativeProject[]> { return (await db.getAllAsync<Row>('SELECT * FROM creative_projects WHERE (archived_at IS NOT NULL)=? ORDER BY updated_at DESC,id DESC', archived ? 1 : 0)).map(project); },
    async project(id: string) { const row = await db.getFirstAsync<Row>('SELECT * FROM creative_projects WHERE id=?', id); return row ? project(row) : undefined; },
    async isTrashed(id: string) { return Boolean(await db.getFirstAsync('SELECT asset_id FROM creative_asset_trash WHERE asset_id=?', id)); },
    async asset(id: string) { const row = await db.getFirstAsync<Row>('SELECT * FROM creative_assets WHERE id=?', id); return row ? asset(row) : undefined; },
    versionAsset: (id: string) => db.getFirstAsync<{ asset_id: string }>('SELECT asset_id FROM creative_asset_versions WHERE id=?', id),
    async usage(assetId:string,offset=0){return readUsageGraph(db,assetId,offset);},
    async covers(){return db.getAllAsync<{project_id:string;version_id:string;relative_path:string|null;state:string|null}>("SELECT c.*,b.relative_path,f.state FROM creative_project_covers c LEFT JOIN creative_version_files f ON f.version_id=c.version_id AND f.role='original' LEFT JOIN artifact_blobs b ON b.sha256=f.blob_sha256");},
    async projectTab(id:string){return (await db.getFirstAsync<{tab:'brief'|'shots'|'assets'|'plans'|'activity'}>('SELECT tab FROM creative_project_views WHERE project_id=?',id))?.tab??'shots';},
    async saveProjectTab(projectId:string,tab:'brief'|'shots'|'assets'|'plans'|'activity'){await withWriteTransaction(db,tx=>tx.runAsync('INSERT INTO creative_project_views VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET tab=excluded.tab',projectId,tab).then(()=>undefined));},
    async description(assetId:string){return db.getFirstAsync<{description:string;tags_json:string}>('SELECT * FROM creative_asset_descriptions WHERE asset_id=?',assetId);},
    async assets(options: { projectId?: string; query?: string; inbox?: boolean; trash?:boolean; kind?: string; limit?: number; after?:{updatedAt:number;id:string} } = {}): Promise<CreativeAsset[]> {
      const rows = await db.getAllAsync<Row>(`WITH originals AS (${importedOriginals}), candidates AS (SELECT a.*,ROW_NUMBER() OVER(PARTITION BY COALESCE(o.kind || ':' || o.blob_sha256,a.id) ORDER BY a.created_at,a.id) AS import_rank FROM creative_assets a LEFT JOIN originals o ON o.asset_id=a.id WHERE EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=a.id)=? AND (? IS NULL OR EXISTS(SELECT 1 FROM creative_project_assets p WHERE p.asset_id=a.id AND p.project_id=?)) AND (?=0 OR NOT EXISTS(SELECT 1 FROM creative_project_assets p WHERE p.asset_id=a.id)) AND (?='all' OR (?='document' AND a.kind IN ('document','prompt')) OR a.kind=?) AND instr(lower(a.title || COALESCE((SELECT description || tags_json FROM creative_asset_descriptions WHERE asset_id=a.id),'')),lower(?))>0) SELECT * FROM candidates WHERE import_rank=1 AND (? IS NULL OR updated_at<? OR (updated_at=? AND id<?)) ORDER BY updated_at DESC,id DESC LIMIT ?`, options.trash ? 1 : 0, options.projectId ?? null, options.projectId ?? null, options.inbox ? 1 : 0, options.kind ?? 'all', options.kind ?? 'all', options.kind ?? 'all', options.query ?? '', options.after?.updatedAt??null,options.after?.updatedAt??null,options.after?.updatedAt??null,options.after?.id??null, Math.min(1000, Math.max(1, options.limit ?? 100)));
      return rows.map(asset);
    },
    async versions(assetId: string): Promise<AssetVersion[]> {
      return (await db.getAllAsync<Row>(`SELECT v.*,f.blob_sha256,COALESCE(r.state,f.state) AS state,b.relative_path,b.mime FROM creative_asset_versions v LEFT JOIN creative_file_resources r ON r.version_id=v.id AND r.role='original' LEFT JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' LEFT JOIN artifact_blobs b ON b.sha256=f.blob_sha256 WHERE v.asset_id=? ORDER BY v.version_no DESC`, assetId)).map(r => ({ id: r.id, assetId: r.asset_id, versionNo: r.version_no, createdAt: r.created_at, source: r.source, recipe: JSON.parse(r.recipe_json), blobSha256: r.blob_sha256 ?? undefined, relativePath: r.relative_path ?? undefined, mime: r.mime ?? undefined, state: r.state ?? 'PENDING' }));
    },
    async availableVersionPage(options: { kind: 'image'|'video'|'audio'; projectId?: string; query?: string; after?: { createdAt: number; id: string }; limit?: number }) {
      const limit = Math.min(100, Math.max(1, options.limit ?? 40));
      const rows = await db.getAllAsync<Row>(`WITH originals AS (${importedOriginals}), candidates AS (SELECT v.id,v.created_at,a.title,ROW_NUMBER() OVER(PARTITION BY COALESCE(o.kind || ':' || o.blob_sha256,v.id) ORDER BY v.created_at,v.id) AS import_rank FROM creative_asset_versions v
        JOIN creative_assets a ON a.id=v.asset_id
        LEFT JOIN originals o ON o.version_id=v.id
        JOIN creative_version_files f ON f.version_id=v.id AND f.role='original'
        LEFT JOIN creative_file_resources r ON r.version_id=v.id AND r.role='original'
        WHERE a.kind=? AND COALESCE(r.state,f.state)='AVAILABLE'
        AND NOT EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=a.id)
        AND (? IS NULL OR EXISTS(SELECT 1 FROM creative_project_assets p WHERE p.asset_id=a.id AND p.project_id=?))
        AND instr(lower(a.title || COALESCE((SELECT description || tags_json FROM creative_asset_descriptions WHERE asset_id=a.id),'')),lower(?))>0
        ) SELECT id,created_at,title FROM candidates WHERE import_rank=1
        AND (? IS NULL OR created_at<? OR (created_at=? AND id<?))
        ORDER BY created_at DESC,id DESC LIMIT ?`, options.kind, options.projectId??null,options.projectId??null, options.query??'', options.after?.createdAt??null,options.after?.createdAt??null,options.after?.createdAt??null,options.after?.id??null,limit+1);
      const page=rows.slice(0,limit), versions=await this.versionsByIds(page.map(r=>r.id)), byId=new Map(versions.map(v=>[v.id,v]));
      const last=page[page.length-1];
      return { items:page.flatMap(r=>{const version=byId.get(r.id);return version?[{title:r.title as string,version}]:[];}), next:rows.length>limit&&last?{createdAt:last.created_at as number,id:last.id as string}:undefined };
    },
    async versionStamp(assetIds: string[]) {
      const rows: unknown[]=[];
      for(let offset=0;offset<assetIds.length;offset+=200){
        const batch=assetIds.slice(offset,offset+200);
        rows.push(...await db.getAllAsync(`SELECT v.id,COALESCE(r.state,f.state) AS state,f.blob_sha256 FROM creative_asset_versions v LEFT JOIN creative_file_resources r ON r.version_id=v.id AND r.role='original' LEFT JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' WHERE v.asset_id IN (${batch.map(()=>'?').join(',')}) ORDER BY v.id`,...batch));
      }
      return JSON.stringify(rows);
    },
    async versionsByIds(ids: string[]): Promise<AssetVersion[]> {
      const result: AssetVersion[] = [], unique = [...new Set(ids)];
      for (let offset = 0; offset < unique.length; offset += 200) {
        const batch = unique.slice(offset, offset + 200);
        result.push(...(await db.getAllAsync<Row>(`SELECT v.*,f.blob_sha256,COALESCE(r.state,f.state) AS state,b.relative_path,b.mime FROM creative_asset_versions v LEFT JOIN creative_file_resources r ON r.version_id=v.id AND r.role='original' LEFT JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' LEFT JOIN artifact_blobs b ON b.sha256=f.blob_sha256 WHERE v.id IN (${batch.map(()=>'?').join(',')}) ORDER BY v.version_no DESC`, ...batch)).map(r => ({ id: r.id, assetId: r.asset_id, versionNo: r.version_no, createdAt: r.created_at, source: r.source, recipe: JSON.parse(r.recipe_json), blobSha256: r.blob_sha256 ?? undefined, relativePath: r.relative_path ?? undefined, mime: r.mime ?? undefined, state: r.state ?? 'PENDING' })));
      }
      return result;
    },
    async latestDeliveries(versionIds: string[]) {
      const result: Array<{version_id:string; status:string; generation:number}> = [];
      const unique = [...new Set(versionIds)];
      for (let offset=0; offset<unique.length; offset+=200) {
        const batch=unique.slice(offset,offset+200);
        result.push(...await db.getAllAsync<{version_id:string;status:string;generation:number}>(`SELECT d.version_id,d.status,d.generation FROM creative_deliveries d WHERE d.version_id IN (${batch.map(()=>'?').join(',')}) AND d.generation=(SELECT MAX(d2.generation) FROM creative_deliveries d2 WHERE d2.version_id=d.version_id)`,...batch));
      }
      return result;
    },
    async latestVersions(assetIds: string[]): Promise<AssetVersion[]> {
      if (!assetIds.length) return [];
      const result:AssetVersion[]=[];
      const unique=[...new Set(assetIds)];
      for(let offset=0;offset<unique.length;offset+=200){
        const batch=unique.slice(offset,offset+200);
        result.push(...(await db.getAllAsync<Row>(`SELECT v.*,f.blob_sha256,COALESCE(r.state,f.state) AS state,b.relative_path,b.mime FROM creative_asset_versions v LEFT JOIN creative_file_resources r ON r.version_id=v.id AND r.role='original' LEFT JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' LEFT JOIN artifact_blobs b ON b.sha256=f.blob_sha256 WHERE v.asset_id IN (${batch.map(()=>'?').join(',')}) AND v.version_no=(SELECT MAX(v2.version_no) FROM creative_asset_versions v2 WHERE v2.asset_id=v.asset_id)`, ...batch)).map(r => ({ id: r.id, assetId: r.asset_id, versionNo: r.version_no, createdAt: r.created_at, source: r.source, recipe: JSON.parse(r.recipe_json), blobSha256: r.blob_sha256 ?? undefined, relativePath: r.relative_path ?? undefined, mime: r.mime ?? undefined, state: r.state ?? 'PENDING' })));
      }
      return result;
    },
    async links(assetId: string) { return db.getAllAsync<{ project_id: string; title: string; pinned_version_id: string | null; revision: number }>('SELECT p.*,j.title FROM creative_project_assets p JOIN creative_projects j ON j.id=p.project_id WHERE asset_id=?', assetId); },
    async deliveries(versionId: string) { return db.getAllAsync<{ id: string; status: string; generation: number; destination_uri: string | null; error_code: string | null }>('SELECT * FROM creative_deliveries WHERE version_id=? ORDER BY generation DESC', versionId); },
    async execute(command: CreativeCommand, key: string, origin?: CreativeAgentOrigin): Promise<CommandResult<Record<string, string>>> {
      id.parse(key);
      if (!(command.name in schemas)) throw new Error('UNKNOWN_CREATIVE_COMMAND');
      const payload = schemas[command.name].parse(command.payload);
      const hash = CryptoJS.SHA256(stable({ name: command.name, payload })).toString();
      return withWriteTransaction(db, async tx => {
        if (origin) await guardCreativeAgentCommand(tx, origin, command);
        const old = await tx.getFirstAsync<{ payload_hash: string; result_json: string }>('SELECT * FROM creative_command_receipts WHERE idempotency_key=?', key);
        if (old) { if (old.payload_hash !== hash) throw new Error('IDEMPOTENCY_CONFLICT'); return JSON.parse(old.result_json); }
        const now = deps.now(); const p = payload as any;
        let value: Record<string, string> = {};
        let execution: AsyncExecutionRef | undefined;
        switch (command.name) {
          case 'change.resolve':value=await resolveCreativeChange(tx,p,now,deps.id);break;
          case 'shot.update':value=origin?await proposeCreativeChange(tx,'shot.update',p,now,deps.id):await applyStoryCommand(tx,'shot.update',p,now,deps.id);break;
          case 'project.setCover':{
            await requireProject(tx,p.id);
            if(p.versionId&&!await tx.getFirstAsync("SELECT v.id FROM creative_asset_versions v JOIN creative_assets a ON a.id=v.asset_id AND a.kind='image' JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' AND f.state='AVAILABLE' WHERE v.id=? AND NOT EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=a.id)",p.versionId))throw new Error('COVER_VERSION_UNAVAILABLE');
            changed(await tx.runAsync('UPDATE creative_projects SET revision=revision+1,updated_at=? WHERE id=? AND revision=?',now,p.id,p.expectedRevision));
            if(p.versionId)await tx.runAsync('INSERT OR IGNORE INTO creative_project_assets SELECT ?,asset_id,?,0 FROM creative_asset_versions WHERE id=?',p.id,p.versionId,p.versionId);
            if(p.versionId)await tx.runAsync('INSERT INTO creative_project_covers VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET version_id=excluded.version_id',p.id,p.versionId);
            else await tx.runAsync('DELETE FROM creative_project_covers WHERE project_id=?',p.id);
            value={projectId:p.id};break;
          }
          case 'asset.authorText': value=await applyAuthoredText(tx,p,now,deps.id);break;
          case 'asset.export': { execution=await enqueueVersionExport(tx,p.versionId,p.generation,now,deps.id);break; }
          case 'project.create': {
            const projectId = deps.id();
            await tx.runAsync('INSERT INTO creative_projects VALUES(?,?,?,0,NULL,?,?)', projectId, p.title, p.brief ?? '', now, now);
            value = { projectId }; break;
          }
          case 'project.update':
            if(origin){value=await proposeCreativeChange(tx,'project.update',p,now,deps.id);break;}
            changed(await tx.runAsync('UPDATE creative_projects SET title=?,brief=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?', p.title, p.brief, now, p.id, p.expectedRevision)); value = { projectId: p.id }; break;
          case 'project.archive':
            changed(await tx.runAsync('UPDATE creative_projects SET archived_at=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?', p.archived ? now : null, now, p.id, p.expectedRevision)); value = { projectId: p.id }; break;
          case 'asset.import': {
            if (p.projectId) await requireProject(tx, p.projectId);
            const blob = await tx.getFirstAsync<{ mime: string }>('SELECT mime FROM artifact_blobs WHERE sha256=?', p.blobSha256);
            if (!blob || (['image','video','audio'].includes(p.kind) && !blob.mime.startsWith(`${p.kind}/`))) throw new Error('ASSET_BLOB_INVALID');
            const existing = await tx.getFirstAsync<{asset_id:string;version_id:string}>(`SELECT o.asset_id,o.version_id FROM (${importedOriginals}) o JOIN creative_assets a ON a.id=o.asset_id
              WHERE o.kind=? AND o.blob_sha256=? ORDER BY EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=o.asset_id),a.created_at,a.id LIMIT 1`,p.kind,p.blobSha256);
            if (existing) {
              const {asset_id:assetId,version_id:versionId}=existing;
              await tx.runAsync('DELETE FROM creative_asset_trash WHERE asset_id=?',assetId);
              await tx.runAsync("UPDATE creative_version_files SET state='AVAILABLE' WHERE version_id=? AND role='original'",versionId);
              await tx.runAsync("UPDATE creative_file_resources SET blob_sha256=?,state='AVAILABLE',last_verified_at=?,error_code=NULL,revision=revision+1,updated_at=? WHERE version_id=? AND role='original'",p.blobSha256,now,now,versionId);
              if(p.projectId) await tx.runAsync('INSERT OR IGNORE INTO creative_project_assets VALUES(?,?,?,0)',p.projectId,assetId,versionId);
              if(p.sourceUri) await tx.runAsync("INSERT INTO creative_recovery_sources(id,resource_id,kind,locator_json,persisted_permission,created_at) SELECT ?,?,'import_uri',?,0,? WHERE NOT EXISTS(SELECT 1 FROM creative_recovery_sources WHERE resource_id=? AND kind='import_uri' AND locator_json=?)",deps.id(),versionId+':original',JSON.stringify({uri:p.sourceUri}),now,versionId+':original',JSON.stringify({uri:p.sourceUri}));
              value={assetId,versionId}; break;
            }
            const assetId = deps.id(), versionId = deps.id();
            await tx.runAsync('INSERT INTO creative_assets VALUES(?,?,?,?,0,?,?)', assetId, p.kind, p.title, versionId, now, now);
            await tx.runAsync("INSERT INTO creative_asset_versions VALUES(?,?,1,'import',?,?)", versionId, assetId, JSON.stringify(p.metadata ? recoverNovelAiMetadata(p.metadata) : {}), now);
            await tx.runAsync("INSERT INTO creative_version_files VALUES(?,'original',?,'AVAILABLE')", versionId, p.blobSha256);
            if (p.sourceUri) await tx.runAsync("INSERT INTO creative_recovery_sources(id,resource_id,kind,locator_json,persisted_permission,created_at) VALUES(?,?,'import_uri',?,0,?)", deps.id(), `${versionId}:original`, JSON.stringify({ uri: p.sourceUri }), now);
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
            if(await tx.getFirstAsync('SELECT c.project_id FROM creative_project_covers c JOIN creative_asset_versions v ON v.id=c.version_id WHERE c.project_id=? AND v.asset_id=?',p.projectId,p.assetId))throw new Error('请先更换或移除项目封面');
            changed(await tx.runAsync('DELETE FROM creative_project_assets WHERE project_id=? AND asset_id=? AND revision=?', p.projectId, p.assetId, p.expectedRevision)); value = { assetId: p.assetId, projectId: p.projectId }; break;
          default: value = command.name in planSchemas ? await applyPlanCommand(tx,command.name,p,now,deps.id,key) : command.name in lifecycleSchemas ? await applyAssetLifecycle(tx,command.name,p,now) : command.name in draftSchemas ? await applyDraftCommand(tx, command.name, p, now, deps.id) : await applyStoryCommand(tx, command.name, p, now, deps.id);
        }
        const receiptId = deps.id(), originId = deps.id();
        const epoch = await tx.getFirstAsync<{ epoch: string }>('SELECT epoch FROM creative_execution_state WHERE id=1');
        if (!epoch) throw new Error('EXECUTION_EPOCH_MISSING');
        const lineage = await tx.getFirstAsync<{ namespace: string }>('SELECT namespace FROM creative_lineage WHERE id=1');
        if (!lineage) throw new Error('SOURCE_NAMESPACE_MISSING');
        await tx.runAsync('INSERT INTO creative_execution_origins VALUES(?,?,?,?,?,?,?,?)', originId, origin ? 'agent' : 'user', lineage.namespace, origin?.threadId ?? null, origin?.runId ?? null, origin?.toolCallId ?? null, command.name, now);
        const result: CommandResult<Record<string,string>> = execution ? { status: 'accepted', receiptId, execution } : { status: 'completed', receiptId, value };
        await tx.runAsync('INSERT INTO creative_command_receipts VALUES(?,?,?,?,?,?,?,?)', receiptId, key, command.name, hash, originId, epoch.epoch, JSON.stringify(result), now);
        return result;
      });
    },
  };
}
