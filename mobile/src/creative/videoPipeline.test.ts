import {resolveJobCredential} from '../tasks/credentialBinding';
import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {createCreativeAccounts} from './accounts';
import {createCreativeBudget as mockCreateCreativeBudget} from './budget';
import {prepareCreativeVideo,confirmCreativeVideo} from './videoRuntime';
import {alignVideoState} from './videoDraftState';
import {createAutodlComfyUiAdapter} from '../workflows/providers/autodl/adapter';
import {bindCreativeAdapter,readCreativeJobBinding} from './boundExecution';
import {createJobStateRepository} from '../tasks/jobStateStore';
import {createOperationRepository} from '../workflows/executor/operationRepository';
import {createDurableExecutor} from '../workflows/executor/durableExecutor';
import {createWorkflowRuntime} from '../workflows/runtime/runtime';
import {archiveCreativeOutput} from './archiveOutput';
import {withWriteTransaction} from '../storage/sqliteBusy';
import base from '../workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json';
import type {RegistryRecord} from '../workflows/registry/types';
import type {WorkflowDefinition} from '../workflows/schema/types';

let mockDb:ReturnType<typeof createInitializedRealSqliteTestDb>,mockAccounts:ReturnType<typeof createCreativeAccounts>,mockRecord:RegistryRecord;
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('./accountRuntime',()=>({creativeAccounts:()=>mockAccounts,creativeBudget:()=>mockCreateCreativeBudget(mockDb as never)}));
jest.mock('../workflows/registry/builtin',()=>({createAppWorkflowCatalog:()=>({bootstrap:async()=>undefined,getActive:async()=>mockRecord})}));
jest.mock('../media/inputReader',()=>({createInputReader:()=>async()=> 'YQ=='}));
jest.mock('./runtime',()=>({creativeFiles:()=>({verify:async()=>({state:'AVAILABLE'})})}));

test('editor workflow bindings survive queue, actual HTTP serialization, account switch, status polling and result archive',async()=>{
  mockDb=createInitializedRealSqliteTestDb();
  try{
    const service=createCreativeService(mockDb as never),secrets=new Map<string,string>();
    mockAccounts=createCreativeAccounts(mockDb as never,{now:Date.now,verify:async()=>({namespace:'autodl',authenticated:false}),secrets:{get:async k=>secrets.get(k)??null,set:async(k,v)=>{secrets.set(k,v);},remove:async k=>{secrets.delete(k);}}});
    const identity=await mockAccounts.connect('autodl','original-test-secret');
    const definition=JSON.parse(JSON.stringify(base));definition.id='alternate.video';definition.platform.workflowId='alternate_remote';
    Object.assign(definition.inputs.properties,{motion:{type:'number',default:0},sound:{type:'boolean',default:false},style:{type:'string',default:'cinematic'}});
    Object.assign(definition.request.bindings,{motion_scale:'motion',enable_audio:'sound',visual_style:'style'});
    definition.ui.sections.push({id:'custom',title:'Custom',fields:['motion','sound','style']});
    mockRecord={workflowId:definition.id,version:definition.version,contentHash:'alternate-hash',definitionJson:JSON.stringify(definition)} as RegistryRecord;
    const input=alignVideoState(mockRecord,definition as WorkflowDefinition,'session',{prompt:'Follow the subject',seed:123,motion:0,sound:false,style:'cinematic'}).input;
    const created=await service.execute({name:'draft.createVideo',payload:{input}},'draft');if(created.status!=='completed')throw new Error('draft');
    const references=[];
    for(const [kind,mime,char] of [['image','image/png','a'],['audio','audio/wav','b']] as const){
      const hash=char.repeat(64);mockDb.runSync('INSERT INTO artifact_blobs VALUES(?,1,?,?,1,1)',hash,mime,`cas/sha256/${hash.slice(0,2)}/${hash}`);
      const asset=await service.execute({name:'asset.import',payload:{title:kind,kind,blobSha256:hash}},kind);if(asset.status!=='completed')throw new Error('asset');references.push(asset.value.versionId);
    }
    await service.execute({name:'draft.replaceVideoMedia',payload:{id:created.value.draftId,expectedRevision:0,imageVersionIds:[references[0]],audioVersionIds:[references[1]]}},'media');
    const preview=await prepareCreativeVideo(created.value.draftId),task=await confirmCreativeVideo(preview);
    const transport=jest.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>new Response(JSON.stringify({code:'Success',data:init?.method==='POST'?{task_id:'remote-task'}:{status:'SUCCESSFUL',results:[{id:'clip',url:'https://cdn.example.test/clip.mp4',type:'video'}]}}),{status:200}));
    const jobs=createJobStateRepository(mockDb as never),operations=createOperationRepository(mockDb as never);let now=Date.now()+100;
    const run=async(kind:'SUBMIT'|'STATUS_SYNC')=>{
      const pending=(await operations.listDue({kind,now,limit:10}))[0];expect(pending).toBeDefined();
      const operation=(await operations.claimById(pending.id,'worker',now,10000))!,binding=(await readCreativeJobBinding(mockDb as never,task.id))!;
      const exact=kind==='SUBMIT'?await mockAccounts.resolveExact(identity.generationId):await resolveJobCredential(mockDb as never,task.id,'query',(id,use)=>mockAccounts.resolveExact(id,use));
      const adapter=bindCreativeAdapter(mockDb as never,createAutodlComfyUiAdapter({transport,token:exact!.token,readBase64:async()=> 'YQ=='}),binding,exact!,operation,'worker',()=>now);
      const adapters=new Map([['autodl-comfyui',adapter]]),executor=createDurableExecutor({jobs,operations,adapters,runtime:createWorkflowRuntime({adapters}),credentials:{get:async()=>({ok:true})},now:()=>now});
      await executor.handle(operation,'worker');now+=6000;
    };
    await run('SUBMIT');expect((await jobs.get(task.id))?.status).toBe('QUEUED');
    expect(transport.mock.calls[0][0]).toMatch(/\/alternate_remote$/);
    expect(JSON.parse(String(transport.mock.calls[0][1]!.body))).toEqual({prompt:'Follow the subject',seed:123,resolution:'768p竖',duration:5,motion_scale:0,enable_audio:false,visual_style:'cinematic',ref_image_0:'data:image/png;base64,YQ==',ref_audio_0:'data:audio/wav;base64,YQ=='});
    await mockAccounts.connect('autodl','different-test-secret');
    await run('STATUS_SYNC');expect((await jobs.get(task.id))?.status).toBe('SUCCEEDED');
    expect(transport.mock.calls[1][0]).toMatch(/\/result\/remote-task$/);
    expect((transport.mock.calls[1][1]!.headers as Record<string,string>).Authorization).toBe('original-test-secret');
    expect(transport.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
    const output=mockDb.getFirstSync<{payload_json:string}>("SELECT payload_json FROM workflow_operations WHERE job_id=? AND kind='ARTIFACT_DOWNLOAD'",task.id)!;
    const hash='c'.repeat(64);mockDb.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'video/mp4',`cas/sha256/cc/${hash}`);
    await withWriteTransaction(mockDb as never,tx=>archiveCreativeOutput(tx,{jobId:task.id,artifact:JSON.parse(output.payload_json).artifact,blob:{sha256:hash},now} as never));
    const draft=(await service.draft(created.value.draftId))!,versions=await service.versions(draft.target_asset_id!);
    expect(versions).toHaveLength(1);expect(versions[0]).toMatchObject({state:'AVAILABLE',mime:'video/mp4',createdAt:now,recipe:{jobId:task.id,workflow:{id:'alternate.video',contentHash:'alternate-hash'},input:{prompt:'Follow the subject',motion:0,sound:false,style:'cinematic'}}});
    expect(JSON.stringify(mockDb.getAllSync('SELECT payload_json FROM workflow_operations'))).not.toMatch(/original-test-secret|different-test-secret/);
    expect(mockDb.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  }finally{mockDb.close();}
});
