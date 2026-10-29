import {importedAssetPeers} from './importIdentity';
import { z } from 'zod';
import type { AppDatabase } from '../storage/appDatabase';
const id=z.string().min(1).max(200),revision=z.number().int().nonnegative();
export const lifecycleSchemas={
  'asset.describe':z.object({id,expectedRevision:revision,title:z.string().trim().min(1).max(200),description:z.string().max(20000),tags:z.array(z.string().trim().min(1).max(80)).max(30)}).strict(),
  'asset.trash':z.object({id,expectedRevision:revision}).strict(),
  'asset.restore':z.object({id,expectedRevision:revision}).strict(),
};
export type LifecycleCommand={[K in keyof typeof lifecycleSchemas]:{name:K;payload:z.input<typeof lifecycleSchemas[K]>}}[keyof typeof lifecycleSchemas];
export async function applyAssetLifecycle(tx:AppDatabase,name:string,p:any,now:number,single=false){
  const asset=await tx.getFirstAsync<{revision:number}>('SELECT revision FROM creative_assets WHERE id=?',p.id);
  if(!asset||asset.revision!==p.expectedRevision)throw new Error('REVISION_CONFLICT');
  if(!single && (name==='asset.trash'||name==='asset.restore')){
    const peers=await importedAssetPeers(tx,p.id);
    if(peers.length>1){
      for(const peer of peers){
        const row=await tx.getFirstAsync<{revision:number}>('SELECT revision FROM creative_assets WHERE id=?',peer);
        await applyAssetLifecycle(tx,name,{id:peer,expectedRevision:row!.revision},now,true);
      }
      return {assetId:p.id};
    }
  }
  if(name==='asset.trash'){
    const used=await tx.getFirstAsync(`SELECT asset_id FROM creative_project_assets WHERE asset_id=? UNION ALL
      SELECT v.asset_id FROM creative_shot_assets s JOIN creative_asset_versions v ON v.id=s.version_id JOIN creative_shots h ON h.id=s.shot_id WHERE v.asset_id=? AND h.deleted_at IS NULL UNION ALL
      SELECT v.asset_id FROM creative_draft_inputs i JOIN creative_asset_versions v ON v.id=i.version_id JOIN creative_generation_drafts d ON d.id=i.draft_id WHERE v.asset_id=? AND d.state='EDITING' LIMIT 1`,p.id,p.id,p.id);
    if(used)throw new Error('资产仍被项目、镜头或编辑中草稿引用，请先解除引用');
    if(await tx.getFirstAsync("SELECT c.job_id FROM creative_job_contexts c JOIN workflow_jobs j ON j.id=c.job_id WHERE c.target_asset_id=? AND j.status IN ('READY_TO_SUBMIT','SUBMITTING','QUEUED','RUNNING','UNKNOWN')",p.id))throw new Error('资产仍有未结束的生成任务');
    await tx.runAsync("INSERT OR IGNORE INTO creative_asset_trash VALUES(?,'user',?)",p.id,now);
  }else if(name==='asset.restore')await tx.runAsync('DELETE FROM creative_asset_trash WHERE asset_id=?',p.id);
  else if(name==='asset.describe'){
    await tx.runAsync('INSERT INTO creative_asset_descriptions VALUES(?,?,?) ON CONFLICT(asset_id) DO UPDATE SET description=excluded.description,tags_json=excluded.tags_json',p.id,p.description,JSON.stringify([...new Set(p.tags)]));
    await tx.runAsync('UPDATE creative_assets SET title=? WHERE id=?',p.title,p.id);
  }else throw new Error('UNKNOWN_CREATIVE_COMMAND');
  await tx.runAsync('UPDATE creative_assets SET revision=revision+1,updated_at=? WHERE id=?',now,p.id);
  return {assetId:p.id};
}
