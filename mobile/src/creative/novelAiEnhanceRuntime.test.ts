import {NativeModules,Platform} from 'react-native';
import {prepareCreativeImage} from './novelAiRuntime';
import {defaultNovelAiDraft} from './novelAiProtocol';
import {createEnhanceInput,enhancementPatch} from './novelAiEnhancement';
let mockInput:any;
const mockDb={}, mockOriginal=jest.fn(), mockResize=jest.fn(), mockResolve=jest.fn(async()=>({})), mockVerify=jest.fn(async()=>({state:'AVAILABLE'}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('./runtime',()=>({creativeFiles:()=>({verify:mockVerify})}));
jest.mock('./accountRuntime',()=>({creativeAccounts:()=>({list:async()=>[{provider_id:'novelai',credential_generation_id:'generation'}],resolveExact:mockResolve})}));
jest.mock('./drafts',()=>({readCreativeDraft:async()=>({id:'draft',provider_id:'novelai',state:'EDITING',input_json:JSON.stringify(mockInput)}),readDraftInputs:async()=>[{version_id:'original',state:'AVAILABLE',mime:'image/png',relative_path:'original.png',blob_sha256:'hash'}]}));
beforeEach(()=>{
  jest.clearAllMocks();
  Platform.OS='android';
  const input=createEnhanceInput({...defaultNovelAiDraft,prompt:'scene'},'original',832,1216);
  mockInput={...input,...enhancementPatch({...input.enhancement!,scale:'1.5'})};
  mockOriginal.mockResolvedValue({image:'original-pixels',width:832,height:1216});
  NativeModules.AutoDLMedia={prepareNovelAiUpscale:mockOriginal,prepareNovelAiImage:mockResize,generateNovelAi:jest.fn(),lookupNovelAi:jest.fn()};
});
afterEach(()=>{delete NativeModules.AutoDLMedia;});
test('Enhance preserves original pixels and sends separate scaled output dimensions',async()=>{
  const preview=await prepareCreativeImage('draft');
  expect(mockVerify).toHaveBeenCalledWith('original');
  expect(mockOriginal).toHaveBeenCalledTimes(1);expect(mockResize).not.toHaveBeenCalled();
  expect(preview.prepared.requestInput.parameters).toMatchObject({image:'original-pixels',width:1280,height:1856});
});
test('a source size mismatch stops preparation before any paid submission',async()=>{
  mockOriginal.mockResolvedValue({image:'different-pixels',width:1024,height:1024});
  await expect(prepareCreativeImage('draft')).rejects.toThrow('底图尺寸已改变');
  expect(mockResize).not.toHaveBeenCalled();
});
