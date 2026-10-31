import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {createCreativeAgentTools} from './agentTools';
import {confirmCreativeVideo} from './videoRuntime';
import {resumeCreativePlans} from './planRuntime';
let mockDb: any;
let mockPreview: any;
const mockSubmit=jest.fn(async(..._args:any[])=>({id:'job'}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('./videoRuntime',()=>({...jest.requireActual('./videoRuntime'),prepareCreativeVideo:async()=>mockPreview}));
jest.mock('./videoSubmission',()=>({...jest.requireActual('./videoSubmission'),submitCreativeVideo:(...args:any[])=>mockSubmit(...args)}));
jest.mock('./accountRuntime',()=>({creativeAccounts:()=>({resolveExact:async()=>({})}),creativeBudget:()=>({grant:async()=> 'auth'})}));
jest.mock('../workflows/registry/builtin',()=>({createAppWorkflowCatalog:()=>({getActive:async()=>({version:'1',contentHash:'hash'})})}));
jest.mock('./planRunner',()=>({runCreativePlans:async(db:any,prepare:any)=>mockSubmit(db,{...await prepare(mockPreview.draft.id),authorizationId:'auth',planStepId:'step'})}));

test.each([true,false])('entry assembly preserves frozen media (audio=%s)',async withAudio=>{
 mockDb=createInitializedRealSqliteTestDb();mockSubmit.mockClear();
 try {
  const service=createCreativeService(mockDb);
  const project=await service.execute({name:'project.create',payload:{title:'test'}},'project');
  if(project.status!=='completed')throw new Error('project');
  const projectId=project.value.projectId;
  const created=await service.execute({name:'draft.createVideo',payload:{projectId,prompt:'pan'}},'draft');
  if(created.status!=='completed')throw new Error('draft');
  mockDb.runSync('INSERT INTO agent_runs VALUES(?,?,0,?)','thread','run',JSON.stringify({status:'running'}));
  mockDb.runSync('INSERT INTO creative_agent_scopes VALUES(?,?,0,1)','thread',projectId);
  const images=[{uri:'asset://image',sha256:'a'.repeat(64),mime:'image/png',size:10,name:'image'}];
  const audios=withAudio?[{uri:'asset://audio',sha256:'b'.repeat(64),mime:'audio/wav',size:10,name:'audio'}]:[];
  mockPreview={db:mockDb,draft:await service.draft(created.value.draftId),images,audios,versionIds:withAudio?['image','audio']:['image'],prepared:{workflowId:'workflow',workflowVersion:'1',workflowContentHash:'hash'},account:{credential_generation_id:'generation'}};
  await confirmCreativeVideo(mockPreview);
  const tool=createCreativeAgentTools().find(t=>t.name==='generation_submit')!;
  const result=await (tool as import('@langchain/core/tools').StructuredToolInterface).invoke({type:'tool_call',id:'call',name:'generation_submit',args:{draftId:created.value.draftId,authorizationId:'auth'}},{configurable:{thread_id:'thread',creative_run_id:'run'}});
  expect(JSON.parse(String((result as any).content))).toMatchObject({status:'accepted'});
  await resumeCreativePlans(mockDb);
  expect(mockSubmit).toHaveBeenCalledTimes(3);
  for(const call of mockSubmit.mock.calls)expect(call[1]).toMatchObject({draftId:created.value.draftId,expectedRevision:0,images,audios,versionIds:mockPreview.versionIds,prepared:mockPreview.prepared,authorizationId:'auth'});
 }finally{mockDb.close();}
});
