import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
async function fixture(){
  const db=createInitializedRealSqliteTestDb(),service=createCreativeService(db as never);
  const p=await service.execute({name:'project.create',payload:{title:'Original',brief:'old'}},'p');if(p.status!=='completed')throw new Error('expected');
  db.runSync("INSERT INTO agent_runs VALUES('thread','run',0,'{\"status\":\"running\"}')");db.runSync("INSERT INTO creative_agent_scopes VALUES('thread',?,0,1)",p.value.projectId);
  const origin={threadId:'thread',runId:'run',toolCallId:'call',projectId:p.value.projectId,scopeRevision:0};
  const change={name:'project.update' as const,payload:{id:p.value.projectId,expectedRevision:0,title:'Suggested',brief:'new'}};
  const r=await service.execute(change,'proposal',origin);if(r.status!=='completed')throw new Error('expected');
  return {db,service,origin,projectId:p.value.projectId,change,proposalId:r.value.proposalId};
}
test('agent edit saves a proposal, user approval mutates once; agent cannot self-approve',async()=>{
  const f=await fixture();try{
    expect((await f.service.project(f.projectId))?.title).toBe('Original');
    expect((await f.service.execute(f.change,'proposal',f.origin))).toMatchObject({value:{proposalId:f.proposalId,reviewState:'WAITING'}});
    const accept={name:'change.resolve' as const,payload:{id:f.proposalId,accept:true}};
    await expect(f.service.execute(accept,'agent-approve',f.origin)).rejects.toThrow('AGENT_COMMAND_NOT_ALLOWED');
    const r=await f.service.execute(accept,'approve');expect(await f.service.execute(accept,'approve')).toEqual(r);
    expect((await f.service.project(f.projectId))?.title).toBe('Suggested');
    expect((await f.service.project(f.projectId))?.revision).toBe(1);
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  }finally{f.db.close();}
});
test('human editing after a proposal blocks stale adoption and permits rejection',async()=>{
  const f=await fixture();try{
    await f.service.execute({...f.change,payload:{...f.change.payload,title:'Human edit'}},'manual');
    await expect(f.service.execute({name:'change.resolve',payload:{id:f.proposalId,accept:true}},'approve')).rejects.toThrow('REVISION_CONFLICT');
    expect(f.db.getFirstSync('SELECT state FROM creative_change_proposals')).toEqual({state:'WAITING'});
    await f.service.execute({name:'change.resolve',payload:{id:f.proposalId,accept:false}},'reject');
    expect((await f.service.project(f.projectId))?.title).toBe('Human edit');
  }finally{f.db.close();}
});
test('approval receipt failure rolls back both adopted content and decision',async()=>{
  const f=await fixture();try{
    f.db.execSync("CREATE TRIGGER reject_review BEFORE INSERT ON creative_command_receipts WHEN NEW.command_name='change.resolve' BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(f.service.execute({name:'change.resolve',payload:{id:f.proposalId,accept:true}},'approve')).rejects.toThrow('injected');
    expect((await f.service.project(f.projectId))?.title).toBe('Original');
    expect(f.db.getFirstSync('SELECT state FROM creative_change_proposals')).toEqual({state:'WAITING'});
  }finally{f.db.close();}
});
