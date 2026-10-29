import {importLegacyCreativeDraft} from './legacyCreativeHandoff';
const mockRead=jest.fn(),mockExecute=jest.fn(),mockDraft=jest.fn(),mockReceipt=jest.fn(),mockMaterialize=jest.fn();
const mockEntries=jest.fn(),mockAlign=jest.fn();
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getFirstAsync:mockReceipt})}));
jest.mock('../handoff/promptDraft',()=>({createPromptDraftStore:()=>({read:mockRead})}));
jest.mock('../handoff/promptHandoff',()=>({materializePromptHandoff:(...a:unknown[])=>mockMaterialize(...a),resolvePromptHandoffValues:(h:any)=>({prompt:h.prompt})}));
jest.mock('../media/attachments',()=>({createAttachmentStore:()=>({externalize:async()=>({hashes:['a'.repeat(64)],releaseStaging:async()=>{}})})}));
jest.mock('./fileImport',()=>({stageCreativeFile:jest.fn()}));
jest.mock('./runtime',()=>({creativeService:()=>({draft:mockDraft,execute:mockExecute})}));
jest.mock('./videoWorkbenchWorkflows',()=>({listVideoWorkflows:()=>mockEntries()}));
jest.mock('./videoDraftState',()=>({alignVideoState:(...a:unknown[])=>mockAlign(...a)}));
jest.mock('../workflows/inputModel',()=>({canonicalInputs:(_d:unknown,v:unknown)=>v}));
beforeEach(()=>{
 jest.clearAllMocks();mockReceipt.mockResolvedValue(null);mockDraft.mockResolvedValue({id:'converted',state:'EDITING'});
 mockRead.mockResolvedValue({prompt:'scene',attachmentIds:[],form:{workflowId:'wf',values:{prompt:'edited'},images:[],audios:[]}});
 mockEntries.mockResolvedValue([{record:{workflowId:'wf'},definition:{},reason:''}]);mockAlign.mockReturnValue({input:{prompt:'edited'},notices:[]});
 mockExecute.mockImplementation(async(c:any)=>({status:'completed',value:c.name==='asset.import'?{versionId:'ref'}:{draftId:'converted'}}));
});
test('imports saved form media and creates one atomic editable draft without generation',async()=>{
 mockRead.mockResolvedValue({prompt:'scene',attachmentIds:[],form:{workflowId:'wf',values:{prompt:'edited'},images:[{uri:'file:///a',mime:'image/png'}],audios:[{uri:'file:///b',mime:'audio/mpeg'}]}});
 await expect(importLegacyCreativeDraft('old')).resolves.toMatchObject({id:'converted'});
 expect(mockExecute).toHaveBeenLastCalledWith({name:'draft.createVideo',payload:{input:{prompt:'edited'},imageVersionIds:['ref'],audioVersionIds:['ref']}},expect.stringMatching(/^handoff.creative./));
 expect(mockExecute.mock.calls.map(c=>c[0].name)).toEqual(['asset.import','asset.import','draft.createVideo']);
});
test('durable receipt reopens the converted draft without reimporting or requiring an unexpired handoff',async()=>{
 mockReceipt.mockResolvedValue({result_json:JSON.stringify({value:{draftId:'converted'}})});
 await importLegacyCreativeDraft('old');expect(mockRead).not.toHaveBeenCalled();expect(mockExecute).not.toHaveBeenCalled();
});
test('incompatible parameters preserve source and do not create a partial draft',async()=>{
 mockAlign.mockReturnValue({input:{},notices:['duration unsupported']});
 await expect(importLegacyCreativeDraft('old')).rejects.toThrow('参数需要核对');expect(mockExecute).not.toHaveBeenCalled();
});
test('missing legacy attachments are not silently discarded',async()=>{
 mockRead.mockResolvedValue({prompt:'scene',attachmentIds:['missing']});
 await expect(importLegacyCreativeDraft('old')).rejects.toThrow('缺少参考素材');expect(mockExecute).not.toHaveBeenCalled();
});
