import {readScopedCreativeText} from './agentTextRead';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import type { CreativeAgentOrigin } from './agentScope';
import { createCreativeAgentTools } from './agentTools';
let mockDb: unknown;
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>mockDb}));

async function fixture(){
  const db=createInitializedRealSqliteTestDb();mockDb=db;const service=createCreativeService(db as never);
  const create=async(title:string)=>{const r=await service.execute({name:'project.create',payload:{title}},title);if(r.status!=='completed')throw new Error('expected');return r.value.projectId;};
  const projectId=await create('one'),other=await create('two');
  db.runSync('INSERT INTO agent_runs VALUES(?,?,0,?)','thread','run',JSON.stringify({status:'running'}));
  db.runSync('INSERT INTO creative_agent_scopes VALUES(?,?,0,1)','thread',projectId);
  const origin:CreativeAgentOrigin={threadId:'thread',runId:'run',toolCallId:'tool',projectId,scopeRevision:0};
  return {db,service,projectId,other,origin};
}
test('agent project scope and revisions are enforced inside the command transaction',async()=>{
  const f=await fixture();try{
    await expect(f.service.execute({name:'draft.createImage',payload:{projectId:f.other}},'cross',f.origin)).rejects.toThrow('SCOPE_MISMATCH');
    const first=await f.service.execute({name:'draft.createImage',payload:{projectId:f.projectId}},'same',f.origin);
    expect(await f.service.execute({name:'draft.createImage',payload:{projectId:f.projectId}},'same',f.origin)).toEqual(first);
    f.db.runSync('UPDATE creative_agent_scopes SET revision=1');
    await expect(f.service.execute({name:'draft.createImage',payload:{projectId:f.projectId}},'changed',f.origin)).rejects.toThrow('SCOPE_CHANGED');
    expect(f.db.getAllSync('SELECT * FROM creative_generation_drafts')).toHaveLength(1);
  }finally{f.db.close();}
});

test('Agent cannot adopt outputs or approve its own shot through hidden command paths',async()=>{
 const f=await fixture();try{
  const result=await f.service.execute({name:'shot.create',payload:{projectId:f.projectId,title:'review me'}},'shot',f.origin);
  if(result.status!=='completed')throw new Error('expected');
  const id=result.value.shotId;
  await expect(f.service.execute({name:'shot.update',payload:{id,expectedRevision:0,title:'review me',description:'',status:'approved'}},'approve',f.origin)).rejects.toThrow('AGENT_ADOPTION_REQUIRES_USER');
  await expect(f.service.execute({name:'shot.selectOutput',payload:{id,expectedRevision:0,slot:'selected_video',versionId:null}},'select',f.origin)).rejects.toThrow('AGENT_ADOPTION_REQUIRES_USER');
  await expect(f.service.execute({name:'asset.pinProjectVersion',payload:{projectId:f.projectId,assetId:'any',expectedRevision:0,versionId:null}},'pin',f.origin)).rejects.toThrow('AGENT_ADOPTION_REQUIRES_USER');
  const names=createCreativeAgentTools().map(t=>t.name);
  expect(names).not.toContain('shot_selectOutput');expect(names).not.toContain('asset_pinProjectVersion');
  expect(f.db.getFirstSync('SELECT editorial_status,revision FROM creative_shots WHERE id=?',id)).toEqual({editorial_status:'planned',revision:0});
  await f.service.execute({name:'shot.update',payload:{id,expectedRevision:0,title:'review me',description:'',status:'approved'}},'user-approve');
  expect(f.db.getFirstSync('SELECT editorial_status FROM creative_shots WHERE id=?',id)).toEqual({editorial_status:'approved'});
 }finally{f.db.close();}
});
test('independent origin retains composite run identity after chat deletion and rejects late tools',async()=>{
  const f=await fixture();try{
    await f.service.execute({name:'draft.createImage',payload:{projectId:f.projectId}},'origin-test',f.origin);
    f.db.runSync("INSERT INTO agent_runs VALUES('another-thread','run',0,'{\"status\":\"running\"}')");
    f.db.runSync("DELETE FROM agent_runs WHERE thread_id='thread'");
    expect(f.db.getFirstSync("SELECT thread_id,run_id,tool_call_id FROM creative_execution_origins WHERE origin_kind='agent'")).toEqual({thread_id:'thread',run_id:'run',tool_call_id:'tool'});
    await expect(f.service.execute({name:'draft.createImage',payload:{projectId:f.projectId}},'late',f.origin)).rejects.toThrow('RUN_NOT_ACTIVE');
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  }finally{f.db.close();}
});
test('actual LangChain tool uses runtime identity and shared command receipts; model cannot supply scope identity',async()=>{
  const f=await fixture();try{
    const tools=createCreativeAgentTools();const create=tools.find(t=>t.name==='draft_createImage')!;
    const result=await (create as import('@langchain/core/tools').StructuredToolInterface).invoke({type:'tool_call',id:'call-1',name:'draft_createImage',args:{projectId:f.projectId}},{configurable:{thread_id:'thread',creative_run_id:'run'}});
    expect(JSON.parse(String((result as {content:unknown}).content)).status).toBe('completed');
    const origin=f.db.getFirstSync("SELECT thread_id,run_id,tool_call_id FROM creative_execution_origins WHERE origin_kind='agent'");
    expect(origin).toEqual({thread_id:'thread',run_id:'run',tool_call_id:'call-1'});
    expect(tools.some(t=>/grant|connect|token/.test(t.name))).toBe(false);
  }finally{f.db.close();}
});
test('agent-authored text enforces project scope for new assets and existing versions',async()=>{
  const f=await fixture();try{
    const hash='b'.repeat(64);f.db.runSync('INSERT INTO artifact_blobs VALUES(?,20,?,?,1,1)',hash,'text/plain','cas/text');
    const command={name:'asset.authorText' as const,payload:{title:'setting',kind:'document' as const,blobSha256:hash,projectId:f.projectId}};
    await expect(f.service.execute({...command,payload:{...command.payload,projectId:f.other}},'cross-text',f.origin)).rejects.toThrow('SCOPE_MISMATCH');
    const r=await f.service.execute(command,'text',f.origin);expect(r).toMatchObject({status:'completed'});
    const other=await f.service.execute({...command,payload:{...command.payload,projectId:f.other}},'other-text');if(other.status!=='completed')throw new Error('expected');
    await expect(f.service.execute({...command,payload:{...command.payload,assetId:other.value.assetId,expectedRevision:0}},'cross-version',f.origin)).rejects.toThrow('ASSET_SCOPE_MISMATCH');
    expect(f.db.getAllSync('SELECT * FROM creative_asset_versions')).toHaveLength(2);
  }finally{f.db.close();}
});


test('text reads enforce scope before and after I/O and return bounded reference data',async()=>{
  const f=await fixture();try{
    const hash='b'.repeat(64);f.db.runSync('INSERT INTO artifact_blobs VALUES(?,20,?,?,1,1)',hash,'text/plain','cas/text');
    const result=await f.service.execute({name:'asset.authorText',payload:{title:'reference',kind:'document',blobSha256:hash,projectId:f.projectId}},'reference');
    if(result.status!=='completed')throw new Error('expected');
    const read=jest.fn(async()=> 'x'.repeat(13000));
    expect(await readScopedCreativeText(f.db as never,f.origin,result.value.versionId,0,read)).toMatchObject({content:'x'.repeat(12000),nextOffset:12000,trust:'untrusted_asset_content'});
    await expect(readScopedCreativeText(f.db as never,f.origin,result.value.versionId,0,async()=>{f.db.runSync('UPDATE creative_agent_scopes SET revision=1');return 'sensitive';})).rejects.toThrow('SCOPE_CHANGED');
    f.db.runSync('UPDATE creative_agent_scopes SET revision=0');
    f.db.runSync('DELETE FROM creative_project_assets');read.mockClear();
    await expect(readScopedCreativeText(f.db as never,f.origin,result.value.versionId,0,read)).rejects.toThrow('ASSET_SCOPE_MISMATCH');
    expect(read).not.toHaveBeenCalled();
  }finally{f.db.close();}
});

test('asset tools page versions and deny cross-project references',async()=>{
 const f=await fixture();try{
  const hash='c'.repeat(64);f.db.runSync('INSERT INTO artifact_blobs VALUES(?,20,?,?,1,1)',hash,'text/plain','cas/page');
  let assetId='';
  for(let i=0;i<26;i++){
   const r=await f.service.execute({name:'asset.authorText',payload:{title:'paged',kind:'document',blobSha256:hash,projectId:f.projectId,...(assetId?{assetId,expectedRevision:i-1}:{})}},'page-'+i);
   if(r.status!=='completed')throw new Error('expected');assetId=r.value.assetId;
  }
  const invoke=async(name:string,args:Record<string,unknown>)=>{
   const t=createCreativeAgentTools().find(t=>t.name===name)!;
   const r=await (t as import('@langchain/core/tools').StructuredToolInterface).invoke({type:'tool_call',id:'read',name,args},{configurable:{thread_id:'thread',creative_run_id:'run'}});
   return JSON.parse(String((r as {content:unknown}).content));
  };
  const search=await invoke('asset_search',{query:'paged'});
  expect(search.items).toHaveLength(1);expect(search.items[0].versions).toHaveLength(5);
  const page=await invoke('asset_versions',{assetId,beforeVersion:search.items[0].nextVersion});
  expect(page.items).toHaveLength(20);
  const last=await invoke('asset_versions',{assetId,beforeVersion:page.nextVersion});
  expect(last.items).toHaveLength(1);expect(last.nextVersion).toBeNull();
  expect(new Set([...search.items[0].versions,...page.items,...last.items].map(v=>v.id)).size).toBe(26);
  f.db.runSync('DELETE FROM creative_project_assets WHERE asset_id=?',assetId);
  expect(await invoke('asset_versions',{assetId})).toMatchObject({status:'error',message:'AGENT_PROJECT_SCOPE_MISMATCH'});
 }finally{f.db.close();}
});

test('project context pages shots and offers scoped full object reads',async()=>{
 const f=await fixture();try{
  for(let i=0;i<32;i++)await f.service.execute({name:'shot.create',payload:{projectId:f.projectId,title:'shot '+i,description:'x'.repeat(1000)}},'shot-'+i);
  const invoke=async(name:string,args:Record<string,unknown>)=>{
   const t=createCreativeAgentTools().find(t=>t.name===name)!;
   const r=await (t as import('@langchain/core/tools').StructuredToolInterface).invoke({type:'tool_call',id:'read',name,args},{configurable:{thread_id:'thread',creative_run_id:'run'}});
   return JSON.parse(String((r as {content:unknown}).content));
  };
  const first=await invoke('creative_context',{}),second=await invoke('creative_context',{after:first.nextShotCursor});
  expect(first.shots).toHaveLength(30);expect(second.shots).toHaveLength(2);expect(second.nextShotCursor).toBeNull();
  expect(first.shots[0].description).toHaveLength(500);expect(first.shots[0].descriptionTruncated).toBe(true);
  expect(new Set([...first.shots,...second.shots].map(s=>s.id)).size).toBe(32);
  expect((await invoke('shot_get',{shotId:first.shots[0].id})).shot.description).toHaveLength(1000);
  expect(await invoke('shot_get',{shotId:'other-project-shot'})).toMatchObject({status:'error'});
 }finally{f.db.close();}
});
