import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import { prepareCreativeVideo } from './videoRuntime';
import definition from '../workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json';
import {alignVideoState} from './videoDraftState';
import type {WorkflowDefinition} from '../workflows/schema/types';
import type {RegistryRecord} from '../workflows/registry/types';
let mockDb: ReturnType<typeof createInitializedRealSqliteTestDb>;
let mockAccounts:any[]=[];
const mockResolve=jest.fn(async()=>({token:'test-only',provider:'autodl'}));
const mockRead=jest.fn(async(..._args:any[])=> 'YXVkaW8=');
const mockGetActive = jest.fn(async (id: string) => id === definition.id ? { workflowId: definition.id, version: definition.version, contentHash: 'test', definitionJson: JSON.stringify(definition) } : undefined);
afterEach(()=>{mockAccounts=[];mockResolve.mockReset().mockResolvedValue({token:'test-only',provider:'autodl'});mockRead.mockReset().mockResolvedValue('YXVkaW8=');});
jest.mock('../storage/databaseClient', () => ({ getDatabase: () => mockDb }));
jest.mock('../workflows/registry/builtin', () => ({ createAppWorkflowCatalog: () => ({ bootstrap: async () => undefined, getActive: (id: string) => mockGetActive(id) }) }));
jest.mock('../media/inputReader',()=>({createInputReader:()=>(...args:any[])=>mockRead(...args)}));
jest.mock('./runtime', () => ({ creativeFiles: () => ({ verify: jest.fn() }) }));
jest.mock('./accountRuntime', () => ({ creativeAccounts: () => ({ list: async () => mockAccounts,resolveExact:()=>mockResolve() }) }));

test('a compatible non-H3 workflow uses its bound field names and includes imported audio in the prepared request',async()=>{
  mockDb=createInitializedRealSqliteTestDb();
  try{
    const alternate=JSON.parse(JSON.stringify(definition));alternate.id='alternate.video';alternate.inputs.properties.clip_prompt=alternate.inputs.properties.prompt;delete alternate.inputs.properties.prompt;alternate.inputs.required[0]='clip_prompt';alternate.request.bindings.prompt='clip_prompt';alternate.ui.sections[0].fields=['clip_prompt'];
    const record={workflowId:alternate.id,version:alternate.version,contentHash:'alternate-hash',definitionJson:JSON.stringify(alternate)} as RegistryRecord;
    mockGetActive.mockResolvedValueOnce(record);mockAccounts=[{provider_id:'autodl',credential_generation_id:'generation'}];
    const input=alignVideoState(record,alternate,'session',{prompt:'Camera follows the subject'}).input;
    const service=createCreativeService(mockDb as never),created=await service.execute({name:'draft.createVideo',payload:{input}},'create');
    if(created.status!=='completed')throw new Error('Expected draft');
    const hash='b'.repeat(64);mockDb.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'audio/wav',`cas/${hash}`);
    const audio=await service.execute({name:'asset.import',payload:{title:'Sound',kind:'audio',blobSha256:hash}},'audio');if(audio.status!=='completed')throw new Error('Expected audio');
    await service.execute({name:'draft.replaceVideoMedia',payload:{id:created.value.draftId,expectedRevision:0,imageVersionIds:[],audioVersionIds:[audio.value.versionId]}},'references');
    const preview=await prepareCreativeVideo(created.value.draftId);
    expect(preview.prepared.workflowId).toBe('alternate.video');expect(preview.prepared.inputSnapshot.clip_prompt).toBe('Camera follows the subject');
    expect(preview.audios).toEqual([expect.objectContaining({sha256:hash,mime:'audio/wav'})]);expect(preview.prepared.inputSnapshot.audios).toEqual(preview.audios);
    expect(preview.prepared.requestInput).toMatchObject({prompt:'Camera follows the subject',audios:preview.audios});
  }finally{mockAccounts=[];mockDb.close();}
});

test('pinned drafts reject a changed active workflow before reaching account or queue creation',async()=>{
  mockDb=createInitializedRealSqliteTestDb();
  try{
    const input=alignVideoState({workflowId:definition.id,version:definition.version,contentHash:'old'} as RegistryRecord,definition as WorkflowDefinition,'session',{prompt:'Pan left'}).input;
    const result=await createCreativeService(mockDb as never).execute({name:'draft.createVideo',payload:{input}},'create');
    if(result.status!=='completed')throw new Error('Expected draft');
    await expect(prepareCreativeVideo(result.value.draftId)).rejects.toThrow('工作流版本已变化');
    expect(mockDb.getAllSync('SELECT * FROM workflow_jobs')).toEqual([]);
  }finally{mockDb.close();}
});

test('workflow-specific values are validated without silently replacing an invalid selection',async()=>{
  mockDb=createInitializedRealSqliteTestDb();
  try{
    const input=alignVideoState({workflowId:definition.id,version:definition.version,contentHash:'test'} as RegistryRecord,definition as WorkflowDefinition,'session',{prompt:'Pan left'}).input;
    input.values.resolution='unsupported';
    const result=await createCreativeService(mockDb as never).execute({name:'draft.createVideo',payload:{input}},'create');
    if(result.status!=='completed')throw new Error('Expected draft');
    await expect(prepareCreativeVideo(result.value.draftId)).rejects.not.toThrow('请先绑定');
    expect(mockDb.getAllSync('SELECT * FROM workflow_jobs')).toEqual([]);
  }finally{mockDb.close();}
});

test.each([false, true])('new and legacy video drafts resolve H3 and reach the account check (legacy=%s)', async legacy => {
  mockDb = createInitializedRealSqliteTestDb();
  try {
    const service = createCreativeService(mockDb as never);
    const result = await service.execute({ name: 'draft.createVideo', payload: { prompt: 'Slow camera pan' } }, 'create');
    if (result.status !== 'completed') throw new Error('Expected draft');
    if (legacy) mockDb.runSync("UPDATE creative_generation_drafts SET workflow_id='minimax_h3_image_audio_to_video_v2_15s'");
    await expect(prepareCreativeVideo(result.value.draftId)).rejects.toThrow('请先绑定 AutoDL 创作凭据');
    expect(mockGetActive).toHaveBeenLastCalledWith(definition.id);
    expect(mockDb.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(0);
  } finally { mockDb.close(); }
});


test('a missing stored secret prevents job, authorization and reservation creation',async()=>{
  mockDb=createInitializedRealSqliteTestDb();try{
    mockAccounts=[{provider_id:'autodl',credential_generation_id:'generation'}];mockResolve.mockRejectedValueOnce(new Error('CREDENTIAL_MISSING'));
    const result=await createCreativeService(mockDb as never).execute({name:'draft.createVideo',payload:{prompt:'Pan left'}},'no-secret');if(result.status!=='completed')throw new Error('Expected draft');
    await expect(prepareCreativeVideo(result.value.draftId)).rejects.toThrow('CREDENTIAL_MISSING');
    for(const table of ['workflow_jobs','creative_authorizations','creative_budget_reservations'])expect(mockDb.getAllSync('SELECT * FROM '+table)).toEqual([]);
  }finally{mockDb.close();}
});
