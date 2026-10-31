import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {readShotSemantics} from './semanticResources';
import {inspectShotQuality} from './shotQuality';
import type {CreativeCommand} from './types';
import {readSemanticDetail,readSemanticVersionPage} from './semanticReads';

test('active semantic references protect lifecycle; historical references stay traceable and diagnose unavailable inputs',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
  const service=createCreativeService(db as never);let key=0;
  const execute=async(command:CreativeCommand)=>{const r=await service.execute(command,'dep-'+key++);if(r.status!=='completed')throw new Error('expected');return r.value;};
  const {projectId}=await execute({name:'project.create',payload:{title:'film'}});
  const {shotId}=await execute({name:'shot.create',payload:{projectId,title:'opening'}});
  const hash='a'.repeat(64);db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'image/png','cas/'+hash);
  const {assetId,versionId}=await execute({name:'asset.import',payload:{title:'face',kind:'image',blobSha256:hash,projectId}});
  const semantic=await execute({name:'semantic.create',payload:{projectId,kind:'character',title:'Lead',content:'Blue',references:[{versionId,purpose:'face'}]}});
  await execute({name:'semantic.adopt',payload:{entityId:semantic.entityId,versionId:semantic.versionId,expectedRevision:0}});
  await execute({name:'semantic.bindShot',payload:{shotId,expectedShotRevision:0,entityId:semantic.entityId,versionId:semantic.versionId}});
  const detail=await readSemanticDetail(db as never,projectId,semantic.entityId);
  expect(detail.adopted?.references[0]).toMatchObject({asset_version_id:versionId,purpose:'face',title:'face',unavailable_reason:null});
  await expect(readSemanticDetail(db as never,'other',semantic.entityId)).rejects.toThrow('NOT_FOUND');
  const draft=await execute({name:'draft.createImage',payload:{projectId,shotId}});
  await expect(execute({name:'asset.unlinkFromProject',payload:{assetId,projectId,expectedRevision:0}})).rejects.toThrow('Lead');
  expect(await service.usage(assetId)).toEqual(expect.arrayContaining([expect.objectContaining({kind:'设定版本',object_id:semantic.versionId,purpose:'face',available:1})]));
  db.runSync("UPDATE creative_file_resources SET state='MISSING' WHERE version_id=?",versionId);
  expect((await readShotSemantics(db as never,shotId,projectId))[0]).toMatchObject({stale:0,unavailableReferences:[expect.objectContaining({unavailable_reason:'ORIGINAL_UNAVAILABLE'})]});
  expect((await inspectShotQuality(db as never,projectId,shotId)).findings).toContainEqual({code:'SEMANTIC_REFERENCE_ORIGINAL_UNAVAILABLE',severity:'error',versionId});
  db.runSync("UPDATE creative_file_resources SET state='AVAILABLE' WHERE version_id=?",versionId);
  const next=await execute({name:'semantic.revise',payload:{entityId:semantic.entityId,expectedRevision:1,content:'No reference',references:[]}});
  await execute({name:'semantic.adopt',payload:{entityId:semantic.entityId,expectedRevision:2,versionId:next.versionId}});
  await expect(execute({name:'asset.unlinkFromProject',payload:{assetId,projectId,expectedRevision:0}})).rejects.toThrow('Lead');
  await execute({name:'semantic.unbindShot',payload:{entityId:semantic.entityId,shotId,expectedShotRevision:1}});
  await expect(execute({name:'asset.unlinkFromProject',payload:{assetId,projectId,expectedRevision:0}})).rejects.toThrow('Lead');
  await execute({name:'draft.discard',payload:{id:draft.draftId,expectedRevision:0}});
  await execute({name:'asset.unlinkFromProject',payload:{assetId,projectId,expectedRevision:0}});
  const asset=(await service.assets()).find(a=>a.id===assetId)!;
  await execute({name:'asset.trash',payload:{id:assetId,expectedRevision:asset.revision}});
  expect(await service.usage(assetId)).toEqual(expect.arrayContaining([expect.objectContaining({kind:'设定版本',available:0})]));
  await expect(execute({name:'semantic.bindShot',payload:{entityId:semantic.entityId,versionId:semantic.versionId,shotId,expectedShotRevision:2}})).rejects.toThrow('SEMANTIC_REFERENCE_UNAVAILABLE');
 }finally{db.close();}
});
test('semantic history paging keeps adopted v1 independently of twenty newer candidates',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
  const service=createCreativeService(db as never);let n=0;
  const execute=async(command:CreativeCommand)=>{const r=await service.execute(command,'page-'+n++);if(r.status!=='completed')throw new Error('expected');return r.value;};
  const {projectId}=await execute({name:'project.create',payload:{title:'film'}});
  const first=await execute({name:'semantic.create',payload:{projectId,kind:'character',title:'Lead',content:'v1',references:[]}});
  await execute({name:'semantic.adopt',payload:{entityId:first.entityId,versionId:first.versionId,expectedRevision:0}});
  for(let i=1;i<=20;i++)await execute({name:'semantic.revise',payload:{entityId:first.entityId,expectedRevision:i,content:'v'+(i+1),references:[]}});
  const detail=await readSemanticDetail(db as never,projectId,first.entityId);
  expect(detail.adopted?.id).toBe(first.versionId);expect(detail.page.items).toHaveLength(20);
  const older=await readSemanticVersionPage(db as never,projectId,first.entityId,detail.page.next!);
  expect(older.items.map(v=>v.id)).toEqual([first.versionId]);expect(older.next).toBeNull();
 }finally{db.close();}
});
