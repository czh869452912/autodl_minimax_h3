import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {readShotSemantics} from './semanticResources';
import {readDraftSemantics} from './draftSemantics';
import type {CreativeCommand} from './types';
test('full shot supports atomic replacement and revision-checked unbinding without changing old draft',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
  const service=createCreativeService(db as never);let key=0;
  const execute=async(command:CreativeCommand)=>{const r=await service.execute(command,'bind-'+key++);if(r.status!=='completed')throw new Error('expected');return r.value;};
  const {projectId}=await execute({name:'project.create',payload:{title:'film'}});
  const {shotId}=await execute({name:'shot.create',payload:{projectId,title:'shot'}});
  const identities=[];
  for(let i=0;i<9;i++)identities.push(await execute({name:'semantic.create',payload:{projectId,kind:'character',title:'Person '+i,content:'content',references:[]}}));
  for(let i=0;i<8;i++)await execute({name:'semantic.bindShot',payload:{shotId,expectedShotRevision:i,entityId:identities[i].entityId,versionId:identities[i].versionId}});
  const draft=await execute({name:'draft.createVideo',payload:{projectId,shotId,prompt:'scene'}});
  const before=await readDraftSemantics(db as never,draft.draftId);
  const replace:CreativeCommand={name:'semantic.bindShot',payload:{shotId,expectedShotRevision:8,entityId:identities[8].entityId,versionId:identities[8].versionId,replaceEntityId:identities[0].entityId}};
  await expect(execute({...replace,payload:{...replace.payload,expectedShotRevision:7}})).rejects.toThrow('REVISION_CONFLICT');
  expect(db.getAllSync('SELECT * FROM creative_shot_semantics')).toHaveLength(8);
  await execute(replace);
  expect(db.getFirstSync('SELECT * FROM creative_shot_semantics WHERE entity_id=?',identities[0].entityId)).toBeFalsy();
  await execute({name:'semantic.unbindShot',payload:{shotId,entityId:identities[8].entityId,expectedShotRevision:9}});
  expect(db.getAllSync('SELECT * FROM creative_shot_semantics')).toHaveLength(7);
  expect(await readDraftSemantics(db as never,draft.draftId)).toEqual(before);
  expect(db.getFirstSync("SELECT command_name FROM creative_command_receipts WHERE command_name='semantic.unbindShot'")).not.toBeNull();
 }finally{db.close();}
});
test('semantic revisions preserve adopted shot references and expose upstream changes without copying blobs',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
  const service=createCreativeService(db as never);let n=0;
  const execute=async(command:CreativeCommand,key=`k-${n++}`)=>{const r=await service.execute(command,key);if(r.status!=='completed')throw new Error('expected');return r.value;};
  const {projectId}=await execute({name:'project.create',payload:{title:'film'}});
  const {shotId}=await execute({name:'shot.create',payload:{projectId,title:'opening'}});
  const create:CreativeCommand={name:'semantic.create',payload:{projectId,kind:'character',title:'Lead',content:'Blue coat',references:[]}};
  const first=await execute(create,'create');expect(await execute(create,'create')).toEqual(first);
  expect(db.getFirstSync('SELECT current_version_id FROM creative_semantic_entities')).toEqual({current_version_id:null});
  await execute({name:'semantic.adopt',payload:{entityId:first.entityId,expectedRevision:0,versionId:first.versionId}});
  await execute({name:'semantic.bindShot',payload:{entityId:first.entityId,versionId:first.versionId,shotId,expectedShotRevision:0}});
  const draft=await execute({name:'draft.createVideo',payload:{projectId,shotId,prompt:'scene'}});
  const second=await execute({name:'semantic.revise',payload:{entityId:first.entityId,expectedRevision:1,content:'Red coat',references:[]}});
  expect((await readShotSemantics(db as never,shotId,projectId))[0]).toMatchObject({version_id:first.versionId,content:'Blue coat',stale:0});
  await execute({name:'semantic.adopt',payload:{entityId:first.entityId,expectedRevision:2,versionId:second.versionId}});
  expect((await readShotSemantics(db as never,shotId,projectId))[0]).toMatchObject({version_id:first.versionId,content:'Blue coat',stale:1});
  await execute({name:'semantic.bindShot',payload:{entityId:first.entityId,versionId:second.versionId,shotId,expectedShotRevision:1}});
  expect((await readDraftSemantics(db as never,draft.draftId))?.items).toEqual([expect.objectContaining({version_id:first.versionId,content:'Blue coat'})]);
  const nextDraft=await execute({name:'draft.createImage',payload:{projectId,shotId}});
  expect((await readDraftSemantics(db as never,nextDraft.draftId))?.items[0].version_id).toBe(second.versionId);
  expect(()=>db.runSync("UPDATE creative_draft_semantics SET snapshot_json='{}'")).toThrow('IMMUTABLE');
  expect(await readDraftSemantics(db as never,'historical-missing')).toBeNull();
  expect(await readShotSemantics(db as never,shotId,'other')).toEqual([]);
  expect(()=>db.runSync('UPDATE creative_semantic_versions SET content=?','changed')).toThrow('IMMUTABLE');
  expect(db.getAllSync('SELECT * FROM artifact_blobs')).toEqual([]);
  await expect(execute({name:'semantic.revise',payload:{entityId:first.entityId,expectedRevision:0,content:'stale',references:[]}})).rejects.toThrow('REVISION_CONFLICT');
  await expect(execute({name:'semantic.revise',payload:{entityId:first.entityId,expectedRevision:3,content:'bad reference',references:[{versionId:'outside',purpose:'face'}]}})).rejects.toThrow('SCOPE_MISMATCH');
  expect(db.getAllSync('SELECT * FROM creative_semantic_versions')).toHaveLength(2);
  db.runSync("INSERT INTO agent_runs VALUES('t','r',0,?)",JSON.stringify({status:'running'}));
  db.runSync("INSERT INTO creative_agent_scopes VALUES('t',?,0,1)",projectId);
  await expect(service.execute({name:'semantic.adopt',payload:{entityId:first.entityId,expectedRevision:3,versionId:first.versionId}},'agent-adopt',{threadId:'t',runId:'r',toolCallId:'call',projectId,scopeRevision:0})).rejects.toThrow('NOT_ALLOWED');
  expect(db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
 }finally{db.close();}
});
