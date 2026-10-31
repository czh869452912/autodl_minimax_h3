import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {readDraftReadiness} from './draftReadiness';

test('local readiness reports missing configuration without creating execution or granting access',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
  const service=createCreativeService(db as never);
  const p=await service.execute({name:'project.create',payload:{title:'readiness'}},'project');
  if(p.status!=='completed')throw new Error('project');
  const d=await service.execute({name:'draft.createVideo',payload:{projectId:p.value.projectId,prompt:'pan'}},'draft');
  if(d.status!=='completed')throw new Error('draft');
  const result=await readDraftReadiness(db as never,d.value.draftId,p.value.projectId);
  expect(result.status).toBe('blocked');
  expect(result.reasons.map(r=>r.code)).toEqual(expect.arrayContaining(['ACCOUNT_NOT_BOUND','WORKFLOW_UNAVAILABLE']));
  expect(result.executionAllowed).toBe(false);
  expect(result.cost.amountMaximum).toBeNull();
  await expect(readDraftReadiness(db as never,d.value.draftId,'other')).rejects.toThrow('SCOPE_MISMATCH');
  for(const table of ['workflow_jobs','creative_authorizations','creative_budget_reservations'])expect(db.getAllSync('SELECT * FROM '+table)).toEqual([]);
 }finally{db.close();}
});
