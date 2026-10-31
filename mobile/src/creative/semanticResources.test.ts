import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {readShotSemantics} from './semanticResources';
import type {CreativeCommand} from './types';
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
  const second=await execute({name:'semantic.revise',payload:{entityId:first.entityId,expectedRevision:1,content:'Red coat',references:[]}});
  expect((await readShotSemantics(db as never,shotId,projectId))[0]).toMatchObject({version_id:first.versionId,content:'Blue coat',stale:0});
  await execute({name:'semantic.adopt',payload:{entityId:first.entityId,expectedRevision:2,versionId:second.versionId}});
  expect((await readShotSemantics(db as never,shotId,projectId))[0]).toMatchObject({version_id:first.versionId,content:'Blue coat',stale:1});
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
