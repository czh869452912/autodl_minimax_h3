import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {readPlanPage,readPlanBatchPage} from './planReads';
import {readBatchReviewTargets} from './planReviewTargets';
test('plan pages remain complete at equal timestamps and batch filters stay project scoped',async()=>{
 const db=await createInitializedRealSqliteTestDb();try{
 const service=createCreativeService(db as never);let n=0;
 const p=await service.execute({name:'project.create',payload:{title:'batch'}},'p');if(p.status!=='completed')throw Error('project');const projectId=p.value.projectId;
 const s=await service.execute({name:'shot.create',payload:{projectId,title:'shot',description:'move'}},'s');if(s.status!=='completed')throw Error('shot');
 const epoch=db.getFirstSync<{epoch:string}>('SELECT epoch FROM creative_execution_state')!.epoch;
 db.runSync('INSERT INTO creative_plan_batches VALUES(?,?,?,?)','batch',projectId,'Batch',100);
 for(let i=0;i<65;i++){
 const id='plan'+String(i).padStart(3,'0');
 db.runSync("INSERT INTO creative_plans VALUES(?,?,?,?,0,'ACTIVE',?,NULL,100,100)",id,projectId,s.value.shotId,id,epoch);
 db.runSync("INSERT INTO creative_plan_steps VALUES(?,?,'video',0,?,NULL,NULL,'{}','{}',NULL)",'step'+i,id,i%2?'FAILED':'BLOCKED');
 if(i<20)db.runSync('INSERT INTO creative_plan_batch_members VALUES(?,?,?)','batch',id,n++);
 }
 const first=await readPlanPage(db as never,projectId),second=await readPlanPage(db as never,projectId,{after:first.next}),third=await readPlanPage(db as never,projectId,{after:second.next});
 expect(new Set([...first.items,...second.items,...third.items].map(p=>p.id)).size).toBe(65);expect(third.next).toBeUndefined();
 const batch=await readPlanBatchPage(db as never,projectId);expect(batch.items[0]).toMatchObject({total:20,failed:10,blocked:10,active:20,completed:0});
 expect((await readPlanPage(db as never,projectId,{batchId:'batch',filter:'failed'})).items).toHaveLength(10);
 expect((await readPlanPage(db as never,'other',{batchId:'batch'})).items).toEqual([]);
 expect((await readPlanBatchPage(db as never,'other')).items).toEqual([]);
 for(let i=0;i<20;i+=2){
 const draft=await service.execute({name:'draft.createVideo',payload:{projectId,prompt:'move'}},'draft'+i);if(draft.status!=='completed')throw Error('draft');
 db.runSync("UPDATE creative_plan_steps SET draft_id=? WHERE plan_id=?",draft.value.draftId,'plan'+String(i).padStart(3,'0'));
 }
 db.runSync("INSERT INTO creative_plan_controls VALUES('plan000',1,1)");
 const review=await readBatchReviewTargets(db as never,projectId,'batch');
 expect(review.included).toHaveLength(9);expect(review.excluded).toHaveLength(11);
 expect(review.excluded).toContainEqual({title:'plan000',reason:'后续已暂停'});
 expect((await readBatchReviewTargets(db as never,'other','batch')).included).toEqual([]);
 }finally{db.close();}
});
