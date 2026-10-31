import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {createOperationRepository} from '../workflows/executor/operationRepository';
import {executeTimelineRender} from './timelineRender';
import {quarantineRestoredExecution} from '../storage/restoreIsolation';
async function fixture(){
 const db=createInitializedRealSqliteTestDb();let n=0;
 const service=createCreativeService(db as never,{id:()=>`t-${++n}`,now:()=>100});
 const command=async(name:any,payload:any)=>{const r=await service.execute({name,payload},`c-${++n}`);if(r.status!=='completed')throw new Error('expected');return r.value;};
 const {projectId}=await command('project.create',{title:'film'}),hash='a'.repeat(64);
 db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'video/mp4',`cas/${hash}`);
 const {versionId}=await command('asset.import',{title:'clip',kind:'video',blobSha256:hash,projectId});
 const spec={schemaVersion:1,orientation:'portrait',clips:[{versionId,startMs:0,durationMs:1000,caption:'字幕'}],audio:null};
 const {timelineId}=await command('timeline.create',{projectId,title:'cut',spec});
 const {renderId}=await command('timeline.render',{id:timelineId});
 const {operation_id:opId}=db.getFirstSync<{operation_id:string}>('SELECT operation_id FROM creative_timeline_renders')!;
 const operations=createOperationRepository(db as never),op=(await operations.claimById(opId,'worker',100,100000))!;
 const render=jest.fn(async()=>({sha256:'b'.repeat(64),byteSize:20,mime:'video/mp4',relativePath:'cas/result.mp4'}));
 const deps={now:()=>100,id:()=>`o-${++n}`,render,cancel:jest.fn(async()=>{})};
 return {db,command,timelineId,renderId,op,deps,operations};
}
test('local render uses durable EXPORT lease, commits one candidate and never creates generation or spend',async()=>{
 const f=await fixture();try{
  expect(await f.command('timeline.render',{id:f.timelineId})).toEqual({renderId:f.renderId});
  await executeTimelineRender(f.db as never,f.op,'worker',f.deps);
  await executeTimelineRender(f.db as never,f.op,'worker',f.deps);
  expect(f.deps.render).toHaveBeenCalledTimes(1);
  expect(f.db.getFirstSync('SELECT state FROM creative_timeline_renders')).toEqual({state:'SUCCEEDED'});
  expect(f.db.getAllSync("SELECT * FROM creative_asset_versions WHERE source='generated'")).toHaveLength(1);
  expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toEqual([]);
  expect(f.db.getAllSync('SELECT * FROM creative_budget_reservations')).toEqual([]);
  expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
 }finally{f.db.close();}
});
test.each(['cancel','restore','lease','missing','native-failure'] as const)('render %s cannot register an output',async(mode)=>{
 const f=await fixture();try{
  if(mode==='missing')f.db.runSync("UPDATE creative_file_resources SET state='MISSING'");
  if(mode==='native-failure')f.deps.render.mockRejectedValue(new Error('SPACE_REQUIRED'));
  if(mode==='cancel')await f.command('timeline.cancelRender',{id:f.renderId});
  if(mode==='restore')quarantineRestoredExecution(f.db as never,'f'.repeat(32));
  if(mode==='lease')f.deps.render.mockImplementationOnce(async()=>{f.db.runSync("UPDATE workflow_operations SET lease_owner='other'");return {sha256:'b'.repeat(64),byteSize:20,mime:'video/mp4',relativePath:'cas/result.mp4'};});
  await executeTimelineRender(f.db as never,f.op,'worker',f.deps);
  expect(f.db.getAllSync("SELECT * FROM creative_asset_versions WHERE source='generated'")).toEqual([]);
  if(['cancel','restore','missing'].includes(mode))expect(f.deps.render).not.toHaveBeenCalled();
  if(mode==='native-failure')expect(f.db.getFirstSync('SELECT state,error FROM creative_timeline_renders')).toEqual({state:'FAILED',error:'SPACE_REQUIRED'});
 }finally{f.db.close();}
});
test('in-flight render prevents timeline removal and transaction failure leaves no partial output',async()=>{
 const f=await fixture();try{
  await expect(f.command('timeline.discard',{id:f.timelineId})).rejects.toThrow('TIMELINE_RENDER_ACTIVE');
  f.db.execSync("CREATE TRIGGER reject_render BEFORE UPDATE OF output_version_id ON creative_timeline_renders WHEN NEW.output_version_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'injected'); END");
  await executeTimelineRender(f.db as never,f.op,'worker',f.deps);
  expect(f.db.getAllSync("SELECT * FROM creative_asset_versions WHERE source='generated'")).toEqual([]);
  expect(f.db.getFirstSync('SELECT state FROM creative_timeline_renders')).toEqual({state:'FAILED'});
 }finally{f.db.close();}
});
