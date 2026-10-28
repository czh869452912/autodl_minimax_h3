import {AIMessageChunk} from '@langchain/core/messages';
import {streamPromptAssistant,proposalPatch,promptContext} from './promptAssistant';
import {defaultNovelAiDraft} from './novelAiProtocol';
const mockStream=jest.fn(),mockBind=jest.fn((_tools:any[])=>({stream:mockStream}));
jest.mock('../agent/modelAdapter',()=>({getH3AgentConfigError:()=>null,createOpenAICompatibleModel:()=>({bindTools:mockBind})}));
jest.mock('../settings/storage',()=>({readSettings:async()=>({llmEndpoint:'https://model.test/v1',llmApiKey:'local',llmModel:'model',llmTimeoutSeconds:'60',llmMaxRetries:'0'})}));
const context={kind:'image' as const,prompt:'cabin',image:{...defaultNovelAiDraft,effort:'high' as const,characters:[{prompt:'red hair',negative:'',x:0.2,y:0.3,enabled:true}]}};
const chunks=(items:AIMessageChunk[])=>(async function*(){for(const item of items)yield item;})();
beforeEach(()=>jest.clearAllMocks());

test('creates separate characters from an empty draft and preserves existing identities when appending',()=>{
 const additions={summary:'双人场景',prompt:'tennis court, afternoon',addCharacters:[{prompt:'red hair, tennis player'},{prompt:'blue hair, referee'}]};
 const empty={...context,image:{...context.image,characters:[]}};
 expect(proposalPatch(additions,empty).characters).toEqual(additions.addCharacters.map(c=>({...c,negative:'',enabled:true,x:0.5,y:0.5})));
 const patch=proposalPatch({...additions,characters:[{index:0,prompt:'updated identity'}]},context);
 expect(patch.characters).toHaveLength(3);
 expect(patch.characters?.[0]).toMatchObject({prompt:'updated identity',x:0.2,y:0.3});
 expect(context.image.characters).toHaveLength(1);
 expect(()=>proposalPatch(additions,{kind:'video',prompt:''})).toThrow('视频');
 expect(()=>proposalPatch({summary:'too many',addCharacters:Array.from({length:6},()=>({prompt:'person'}))},{...context,image:{...context.image,model:'nai-diffusion-4-5-full'}})).toThrow('6');
 expect(()=>proposalPatch({summary:'negative',addCharacters:[{prompt:'person',negative:'bad'}]},{...empty,image:{...empty.image,effort:'medium'}})).toThrow('Medium');
});
test('streams text, executes validation, then returns a typed proposal without changing the draft',async()=>{
 mockStream.mockResolvedValueOnce(chunks([new AIMessageChunk({content:'检查角色',tool_calls:[{id:'a',name:'validate_prompt',args:{summary:'保留角色',characters:[{index:0,prompt:'red hair, moonlight'}]}}]})])).mockResolvedValueOnce(chunks([new AIMessageChunk({content:'建议如下',tool_calls:[{id:'b',name:'propose_prompt',args:{summary:'增加月光',prompt:'moonlit cabin'}}]})]));
 const text=jest.fn(),status=jest.fn(),events=jest.fn(),activities=jest.fn();const result=await streamPromptAssistant(context,[{role:'user',content:'增加月光'}],new AbortController().signal,text,status,events,activities);
 expect(events.mock.calls.map(([tool])=>[tool.id,tool.status])).toEqual([['a','running'],['a','complete'],['b','running'],['b','complete']]);
 expect(activities.mock.calls.map(([a])=>a.kind)).toEqual(['text','tool','text','tool']);
 expect(activities.mock.calls[0][0].messageId).not.toBe(activities.mock.calls[2][0].messageId);
 expect(result.proposal?.prompt).toBe('moonlit cabin');expect(text).toHaveBeenCalledWith('检查角色\n\n建议如下');expect(status).toHaveBeenCalledWith('检查模型与角色约束…');
 expect(mockStream.mock.calls[1][0].some((m:any)=>m.content==='{"valid":true}')).toBe(true);
 expect(context.prompt).toBe('cabin');expect(mockBind.mock.calls[0][0].map((t:any)=>t.function.name)).toEqual(['propose_prompt','validate_prompt','search_tags']);
});
test('character proposals preserve positions and reject invalid indexes and unsupported negatives',()=>{
 expect(proposalPatch({summary:'改光线',characters:[{index:0,prompt:'moonlight'}]},context).characters?.[0]).toMatchObject({prompt:'moonlight',x:0.2,y:0.3,enabled:true});
 expect(()=>proposalPatch({summary:'bad',characters:[{index:2,prompt:'x'}]},context)).toThrow('索引');
 expect(()=>proposalPatch({summary:'bad',negative:'x'},{...context,image:{...context.image,effort:'medium'}})).toThrow('Medium');
 expect(()=>proposalPatch({summary:'bad',negative:'x'},{prompt:'pan',kind:'video'})).toThrow('视频');
 expect(promptContext(context)).not.toHaveProperty('sourceVersionId');
});
test('cancelled requests cannot emit a suggestion',async()=>{
 const controller=new AbortController();controller.abort();await expect(streamPromptAssistant(context,[],controller.signal,jest.fn(),jest.fn())).rejects.toThrow('停止');expect(mockStream).not.toHaveBeenCalled();
});

test('records provider reasoning before replies without leaking it into answer text',async()=>{
 mockStream.mockResolvedValueOnce(chunks([new AIMessageChunk({content:'',additional_kwargs:{reasoning_content:'Inspect the scene'}}),new AIMessageChunk({content:'建议保留构图'})]));
 const events=jest.fn();const result=await streamPromptAssistant(context,[],new AbortController().signal,jest.fn(),jest.fn(),jest.fn(),events);
 expect(events.mock.calls.map(([a])=>a.kind)).toEqual(['reasoning','text']);
 expect(result.content).toBe('建议保留构图');
});
