import {z} from 'zod';
import type {AppDatabase} from '../storage/appDatabase';
const id=z.string().min(1).max(200);
export const authoredTextSchemas={
  'asset.authorText':z.object({title:z.string().trim().min(1).max(200),kind:z.enum(['prompt','document']),blobSha256:z.string().regex(/^[a-f0-9]{64}$/),projectId:id.optional(),assetId:id.optional(),expectedRevision:z.number().int().nonnegative().optional()}).strict().refine(p=>Boolean(p.assetId)===(p.expectedRevision!==undefined)),
};
export type AuthoredTextCommand={name:'asset.authorText';payload:z.input<typeof authoredTextSchemas['asset.authorText']>};
export async function applyAuthoredText(tx:AppDatabase,p:AuthoredTextCommand['payload'],now:number,makeId:()=>string){
  const blob=await tx.getFirstAsync<{mime:string;byte_size:number}>('SELECT mime,byte_size FROM artifact_blobs WHERE sha256=?',p.blobSha256);
  if(!blob||blob.mime!=='text/plain'||blob.byte_size>100*1024||blob.byte_size<1)throw new Error('TEXT_BLOB_INVALID');
  if(p.projectId&&!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',p.projectId))throw new Error('PROJECT_NOT_AVAILABLE');
  const assetId=p.assetId??makeId(),versionId=makeId();let versionNo=1;
  if(p.assetId){
    const asset=await tx.getFirstAsync<{revision:number;kind:string}>('SELECT * FROM creative_assets WHERE id=? AND NOT EXISTS(SELECT 1 FROM creative_asset_trash WHERE asset_id=?)',assetId,assetId);
    if(!asset||asset.revision!==p.expectedRevision||asset.kind!==p.kind)throw new Error('REVISION_CONFLICT');
    versionNo=(await tx.getFirstAsync<{n:number}>('SELECT MAX(version_no) AS n FROM creative_asset_versions WHERE asset_id=?',assetId))!.n+1;
    await tx.runAsync('UPDATE creative_assets SET title=?,revision=revision+1,updated_at=? WHERE id=?',p.title,now,assetId);
  }else await tx.runAsync('INSERT INTO creative_assets VALUES(?,?,?,NULL,0,?,?)',assetId,p.kind,p.title,now,now);
  await tx.runAsync("INSERT INTO creative_asset_versions VALUES(?,?,?,'authored',?,?)",versionId,assetId,versionNo,JSON.stringify({schemaVersion:1,format:'text/plain'}),now);
  await tx.runAsync("INSERT INTO creative_version_files VALUES(?,'original',?,'AVAILABLE')",versionId,p.blobSha256);
  await tx.runAsync("INSERT INTO artifact_blob_refs VALUES(?,'creative_version',?,?)",p.blobSha256,versionId,now);
  if(!p.assetId)await tx.runAsync('UPDATE creative_assets SET current_version_id=? WHERE id=?',versionId,assetId);
  if(p.projectId)await tx.runAsync('INSERT OR IGNORE INTO creative_project_assets VALUES(?,?,?,0)',p.projectId,assetId,versionId);
  return {assetId,versionId};
}
