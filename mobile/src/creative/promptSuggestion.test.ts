import {suggestCreativePrompt} from './promptSuggestion';
const mockInvoke=jest.fn();
jest.mock('../agent/modelAdapter',()=>({getH3AgentConfigError:()=>null,createOpenAICompatibleModel:()=>({invoke:mockInvoke})}));
jest.mock('../settings/storage',()=>({readSettings:async()=>({llmEndpoint:'https://model.test/v1',llmApiKey:'local',llmModel:'model',llmTimeoutSeconds:'60',llmMaxRetries:'0'})}));

test('manual assistance sends only text and returns a suggestion without agent tools',async()=>{
  mockInvoke.mockResolvedValue({content:'a moonlit observatory',tool_calls:[]});
  const signal=new AbortController().signal;
  await expect(suggestCreativePrompt({kind:'image',prompt:'a cabin',instruction:'add moonlight'},signal)).resolves.toBe('a moonlit observatory');
  expect(mockInvoke).toHaveBeenCalledWith([expect.objectContaining({role:'system'}),expect.objectContaining({role:'user',content:JSON.stringify({currentPrompt:'a cabin',direction:'add moonlight'})})],{signal});
});
test('tool responses and cancelled requests cannot become an applied prompt',async()=>{
  mockInvoke.mockResolvedValue({content:'done',tool_calls:[{name:'image.generate'}]});
  await expect(suggestCreativePrompt({kind:'video',prompt:'pan',instruction:''},new AbortController().signal)).rejects.toThrow('未返回');
  const controller=new AbortController();controller.abort();
  await expect(suggestCreativePrompt({kind:'video',prompt:'pan',instruction:''},controller.signal)).rejects.toThrow('取消');
});
