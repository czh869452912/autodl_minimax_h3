import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import { readAgentCreativeActivity, agentCreativeActivityLabel } from './agentCreativeActivity';

async function fixture() {
  const db=createInitializedRealSqliteTestDb(),service=createCreativeService(db as never);
  const project=await service.execute({name:'project.create',payload:{title:'手机测试'}},'project');
  if(project.status!=='completed')throw new Error('Expected project');
  const projectId=project.value.projectId;
  db.runSync('INSERT INTO agent_runs VALUES(?,?,0,?)','thread','run',JSON.stringify({status:'running'}));
  db.runSync('INSERT INTO creative_agent_scopes VALUES(?,?,0,1)','thread',projectId);
  const result=await service.execute({name:'draft.createImage',payload:{projectId}},'draft',{
    threadId:'thread',runId:'run',toolCallId:'create',projectId,scopeRevision:0,
  });
  if(result.status!=='completed')throw new Error('Expected draft');
  const draftId=result.value.draftId;
  const read=()=>readAgentCreativeActivity(db as never,'thread');
  const submit=()=>{
    db.runSync("INSERT INTO workflow_jobs(id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at) VALUES('job','image','1','hash','novelai','1','{}','QUEUED',1,1)");
    db.runSync("UPDATE creative_generation_drafts SET state='SUBMITTED',job_id='job' WHERE id=?",draftId);
  };
  const archive=async()=>{
    const hash='a'.repeat(64);
    db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'image/png','cas/generated.png');
    const asset=await service.execute({name:'asset.import',payload:{title:'已生成图片',kind:'image',blobSha256:hash,projectId}},'output');
    if(asset.status!=='completed')throw new Error('Expected output');
    db.runSync('UPDATE creative_generation_drafts SET target_asset_id=? WHERE id=?',asset.value.assetId,draftId);
    db.runSync("INSERT INTO creative_output_links VALUES('job','output',?)",asset.value.versionId);
    return asset.value.versionId;
  };
  return {db,service,projectId,draftId,read,submit,archive};
}

test('durable activity distinguishes draft, queued job, completed job and a viewable archived image',async()=>{
  const f=await fixture();try{
    expect(agentCreativeActivityLabel((await f.read())[0])).toBe('仅保存草稿 · 尚未提交生成');
    f.submit();
    expect(agentCreativeActivityLabel((await f.read())[0])).toBe('排队中');
    f.db.runSync("UPDATE workflow_jobs SET status='SUCCEEDED'");
    expect(agentCreativeActivityLabel((await f.read())[0])).toBe('生成已完成 · 正在归档成果');
    const versionId=await f.archive();
    const activity=await f.read();
    expect(activity).toHaveLength(1);
    expect(activity[0].jobId).toBe('job');
    expect(activity[0].outputs).toMatchObject([{id:versionId,relativePath:'cas/generated.png',mime:'image/png',state:'AVAILABLE'}]);
    expect(agentCreativeActivityLabel(activity[0])).toBe('已有 1 个成果可查看');
    f.db.runSync("UPDATE creative_file_resources SET state='MISSING'");
    expect(agentCreativeActivityLabel((await f.read())[0])).toBe('生成已完成 · 原文件待恢复');
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  }finally{f.db.close();}
});

test('failed or uncertain jobs are not represented as generated images and another project cannot see them',async()=>{
  const f=await fixture();try{
    f.submit();
    f.db.runSync("UPDATE workflow_jobs SET status='FAILED'");
    expect(agentCreativeActivityLabel((await f.read())[0])).toBe('生成失败 · 查看原因');
    f.db.runSync("UPDATE workflow_jobs SET status='UNKNOWN'");
    expect(agentCreativeActivityLabel((await f.read())[0])).toBe('结果不确定 · 需要核查');
    const other=await f.service.execute({name:'project.create',payload:{title:'其他项目'}},'other');
    if(other.status!=='completed')throw new Error('Expected project');
    f.db.runSync('UPDATE creative_agent_scopes SET project_id=?,revision=1',other.value.projectId);
    expect(await f.read()).toEqual([]);
    f.db.runSync('UPDATE creative_agent_scopes SET project_id=NULL');
    expect(await f.read()).toEqual([]);
  }finally{f.db.close();}
});

test('multiple draft edits do not duplicate the task and only output links belonging to that job are shown',async()=>{
  const f=await fixture();try{
    const draft=(await f.service.draft(f.draftId))!;
    for(let i=0;i<3;i++)await f.service.execute({name:'draft.updateImage',payload:{id:f.draftId,expectedRevision:i,input:JSON.parse(draft.input_json)}},`edit-${i}`,{threadId:'thread',runId:'run',toolCallId:`edit-${i}`,projectId:f.projectId,scopeRevision:0});
    f.submit();await f.archive();
    const row=(await f.read())[0];
    expect(await f.read()).toHaveLength(1);
    f.db.runSync("INSERT INTO creative_asset_versions VALUES('unrelated',?,2,'generated','{}',2)",row.draft!.target_asset_id);
    expect((await f.read())[0].outputs).toHaveLength(1);
    f.db.runSync("UPDATE creative_generation_drafts SET state='DISCARDED'");
    expect(await f.read()).toEqual([]);
  }finally{f.db.close();}
});
