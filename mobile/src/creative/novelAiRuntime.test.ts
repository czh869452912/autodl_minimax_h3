import {NativeModules,Platform} from 'react-native';
import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {prepareCreativeImage,confirmCreativeImage} from './novelAiRuntime';
import {defaultNovelAiDraft} from './novelAiProtocol';
import * as fs from 'node:fs';
import * as path from 'node:path';

let mockDb:ReturnType<typeof createInitializedRealSqliteTestDb>;
const mockResolve=jest.fn(),mockGrant=jest.fn();
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('./accountRuntime',()=>({creativeAccounts:()=>({list:async()=>[{provider_id:'novelai',credential_generation_id:'generation'}],resolveExact:mockResolve}),creativeBudget:()=>({grant:mockGrant})}));
jest.mock('./runtime',()=>({creativeFiles:()=>({verify:async()=>({state:'AVAILABLE'})})}));
beforeEach(()=>{
  mockDb=createInitializedRealSqliteTestDb();mockResolve.mockReset().mockResolvedValue({});mockGrant.mockReset();
  Platform.OS='android';
  NativeModules.AutoDLMedia={generateNovelAi:jest.fn(),lookupNovelAi:jest.fn(),upscaleNovelAi:jest.fn(),prepareNovelAiUpscale:jest.fn(async()=>({image:fs.readFileSync(path.join(__dirname,'__fixtures__/novelai-enhanced-size.png')).toString('base64'),width:1467,height:2144}))};
});
afterEach(()=>{mockDb.close();delete NativeModules.AutoDLMedia;});
async function draft(upscale:boolean){
  const service=createCreativeService(mockDb as never);
  if(!upscale){const r=await service.execute({name:'draft.createImage',payload:{input:{...defaultNovelAiDraft,prompt:'scene'}}},'draft');if(r.status!=='completed')throw new Error('draft');return r.value.draftId;}
  const hash='a'.repeat(64);mockDb.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'image/png',`cas/${hash}`);
  const asset=await service.execute({name:'asset.import',payload:{title:'source',kind:'image',blobSha256:hash}},'source');if(asset.status!=='completed')throw new Error('asset');
  const r=await service.execute({name:'draft.createUpscale',payload:{versionId:asset.value.versionId}},'draft');if(r.status!=='completed')throw new Error('draft');return r.value.draftId;
}
function noSubmission(){
  expect(mockGrant).not.toHaveBeenCalled();
  for(const table of ['workflow_jobs','creative_authorizations','creative_budget_reservations'])expect(mockDb.getAllSync('SELECT * FROM '+table)).toEqual([]);
  expect(NativeModules.AutoDLMedia.generateNovelAi).not.toHaveBeenCalled();expect(NativeModules.AutoDLMedia.upscaleNovelAi).not.toHaveBeenCalled();
}
test.each([false,true])('missing image/upscale secret stops before job and authorization creation (upscale=%s)',async upscale=>{
  const id=await draft(upscale);mockResolve.mockRejectedValueOnce(new Error('CREDENTIAL_MISSING'));
  await expect(prepareCreativeImage(id)).rejects.toThrow('CREDENTIAL_MISSING');noSubmission();
});
test.each([false,true])('account disconnected after preparation cannot enqueue image/upscale (upscale=%s)',async upscale=>{
  const preview=await prepareCreativeImage(await draft(upscale));mockResolve.mockRejectedValueOnce(new Error('CREDENTIAL_INACTIVE'));
  await expect(confirmCreativeImage(preview)).rejects.toThrow('CREDENTIAL_INACTIVE');noSubmission();
});
test('an APK without the required native endpoint fails before job creation',async()=>{
  const id=await draft(true);delete NativeModules.AutoDLMedia.upscaleNovelAi;
  await expect(prepareCreativeImage(id)).rejects.toThrow('请安装支持超分的新版 Android 应用');
  expect(mockGrant).not.toHaveBeenCalled();expect(mockDb.getAllSync('SELECT * FROM workflow_jobs')).toEqual([]);
});
