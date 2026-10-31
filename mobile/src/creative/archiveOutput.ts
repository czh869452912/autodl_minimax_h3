import {enqueueVersionExport} from './enqueueVersionExport';
import type { AppDatabase } from '../storage/appDatabase';
import type { ArtifactCommitInput } from '../workflows/executor/artifactOperation';
import { createId } from '../ids';

/** Part of the download commit transaction: never adopt the output automatically. */
export async function archiveCreativeOutput(tx: AppDatabase, input: ArtifactCommitInput) {
  let context = await tx.getFirstAsync<{ target_asset_id: string; input_snapshot_json: string; execution_epoch: string }>('SELECT * FROM creative_job_contexts WHERE job_id=?', input.jobId);
  if (!['video','image'].includes(input.artifact.kind)) return;
  const old = await tx.getFirstAsync<{ version_id:string; blob_sha256: string }>("SELECT f.version_id,f.blob_sha256 FROM creative_output_links l JOIN creative_version_files f ON f.version_id=l.version_id AND f.role='original' WHERE l.job_id=? AND l.artifact_id=?", input.jobId, input.artifact.id);
  if (old) {
    if (old.blob_sha256 !== input.blob.sha256) throw new Error('CREATIVE_OUTPUT_CONTENT_CHANGED');
    await tx.runAsync("UPDATE creative_file_resources SET state='AVAILABLE',error_code=NULL,last_verified_at=?,updated_at=?,revision=revision+1 WHERE version_id=? AND role='original'",input.now,input.now,old.version_id);
    await tx.runAsync("INSERT OR IGNORE INTO artifact_blob_refs VALUES(?,'creative_version',?,?)",input.blob.sha256,old.version_id,input.now);
    return;
  }
  if(!context){
    if(await tx.getFirstAsync('SELECT id FROM media_asset_tombstones WHERE task_id=? AND artifact_id=?',input.jobId,input.artifact.id))return;
    const job=await tx.getFirstAsync<{input_json:string}>('SELECT input_json FROM workflow_jobs WHERE id=?',input.jobId);
    if(!job)return;
    const mapped=await tx.getFirstAsync<{version_id:string;asset_id:string;blob_sha256:string|null}>(`SELECT m.version_id,m.asset_id,f.blob_sha256 FROM creative_legacy_assets m JOIN media_assets a ON a.id=m.source_id
      LEFT JOIN creative_version_files f ON f.version_id=m.version_id AND f.role='original' WHERE a.task_id=? AND a.artifact_id=?`,input.jobId,input.artifact.id);
    if(mapped){
      if(mapped.blob_sha256&&mapped.blob_sha256!==input.blob.sha256)throw new Error('CREATIVE_OUTPUT_CONTENT_CHANGED');
      if(!mapped.blob_sha256)await tx.runAsync("INSERT INTO creative_version_files VALUES(?,'original',?,'AVAILABLE')",mapped.version_id,input.blob.sha256);
      await tx.runAsync("INSERT OR IGNORE INTO artifact_blob_refs VALUES(?,'creative_version',?,?)",input.blob.sha256,mapped.version_id,input.now);
      await tx.runAsync('INSERT INTO creative_output_links VALUES(?,?,?)',input.jobId,input.artifact.id,mapped.version_id);
      return;
    }
    const assetId=createId();
    await tx.runAsync('INSERT INTO creative_assets VALUES(?,?,?,NULL,0,?,?)',assetId,input.artifact.kind,'历史入口生成成果',input.now,input.now);
    context={target_asset_id:assetId,input_snapshot_json:job.input_json,execution_epoch:''};
  }
  const versionId = createId();
  const next = await tx.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(version_no),0)+1 AS n FROM creative_asset_versions WHERE asset_id=?', context.target_asset_id);
  const {_semanticContext,...snapshot} = JSON.parse(context.input_snapshot_json);
  const recipe = { schemaVersion: 1, provider: input.artifact.kind === 'image' ? 'novelai' : 'autodl', jobId: input.jobId, artifactId: input.artifact.id, semanticContext:_semanticContext??null, input: { ...snapshot, ...(typeof input.artifact.metadata?.seed === 'number' ? { seed: input.artifact.metadata.seed } : {}) } };
  if(input.artifact.kind==='video'){
    const job=await tx.getFirstAsync<{workflow_id:string;workflow_version:string;workflow_hash:string}>('SELECT workflow_id,workflow_version,workflow_hash FROM workflow_jobs WHERE id=?',input.jobId);
    const draft=await tx.getFirstAsync<{input_json:string}>('SELECT d.input_json FROM creative_job_contexts c JOIN creative_generation_drafts d ON d.id=c.draft_id WHERE c.job_id=?',input.jobId);
    const pinned=draft?JSON.parse(draft.input_json):undefined;
    if(job)Object.assign(recipe,{workflow:{id:job.workflow_id,version:job.workflow_version,contentHash:job.workflow_hash,title:pinned?.workflow?.title??job.workflow_id}});
  }
  const {width,height}=input.artifact.metadata??{};
  if(snapshot.operation==='upscale'){
    const source=await tx.getFirstAsync<{recipe_json:string}>('SELECT recipe_json FROM creative_asset_versions WHERE id=?',snapshot.sourceVersionId);
    if(!source)throw new Error('UPSCALE_SOURCE_MISSING');
    const original=JSON.parse(source.recipe_json);
    Object.assign(recipe,{operation:'upscale',upscale:{...snapshot},sourceVersionId:snapshot.sourceVersionId,...(original.raw?{raw:original.raw}:{}),...(original.notices?{notices:original.notices}:{})});
    if(original.input)Object.assign(recipe,{input:original.input});else delete (recipe as {input?:unknown}).input;
  }
  if(input.artifact.kind==='image' && typeof width==='number' && typeof height==='number' && Number.isInteger(width) && Number.isInteger(height) && width>0 && height>0 && width*height<=(snapshot.operation==='upscale'?12582912:3145728))Object.assign(recipe,{output:{width,height}});
  await tx.runAsync("INSERT INTO creative_asset_versions VALUES(?,?,?,'generated',?,?)", versionId, context.target_asset_id, next!.n, JSON.stringify(recipe), input.now);
  await tx.runAsync("INSERT INTO creative_version_files VALUES(?,'original',?,'AVAILABLE')", versionId, input.blob.sha256);
  await tx.runAsync("INSERT INTO artifact_blob_refs VALUES(?,'creative_version',?,?)", input.blob.sha256, versionId, input.now);
  await tx.runAsync('INSERT INTO creative_output_links VALUES(?,?,?)', input.jobId, input.artifact.id, versionId);
  if(input.artifact.kind==='image' && input.deliveryPolicy?.autoExportImagesToGallery)await enqueueVersionExport(tx,versionId,1,input.now);
  await tx.runAsync('UPDATE creative_assets SET updated_at=? WHERE id=?', input.now, context.target_asset_id);
}
