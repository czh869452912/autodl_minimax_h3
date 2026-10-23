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
