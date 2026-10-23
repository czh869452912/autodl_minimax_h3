import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {readProjectActivity} from './projectActivity';
test('project activity derives scoped durable commands and preserves agent origin after chat deletion',async()=>{
  const db=createInitializedRealSqliteTestDb();try{
    const service=createCreativeService(db as never);
    const p=await service.execute({name:'project.create',payload:{title:'film'}},'p');
    if(p.status!=='completed')throw new Error('expected');
    await service.execute({name:'project.create',payload:{title:'other'}},'other');
    db.runSync("INSERT INTO agent_runs VALUES('thread','run',0,'{\"status\":\"running\"}')");
    db.runSync("INSERT INTO creative_agent_scopes VALUES('thread',?,0,1)",p.value.projectId);
    await service.execute({name:'draft.createImage',payload:{projectId:p.value.projectId}},'draft',{threadId:'thread',runId:'run',toolCallId:'call',projectId:p.value.projectId,scopeRevision:0});
    db.runSync("DELETE FROM agent_runs WHERE thread_id='thread'");
    const rows=await readProjectActivity(db as never,p.value.projectId);
    expect(rows).toHaveLength(2);
    expect(rows.find(r=>r.label==='draft.createImage')).toMatchObject({origin:'agent',state:'已保存'});
    expect(rows.filter(r=>r.label==='project.create')).toHaveLength(1);
  }finally{db.close();}
});
