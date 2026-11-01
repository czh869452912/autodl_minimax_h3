import * as SecureStore from 'expo-secure-store';
import {saveLlmConnection,revokeLlmConnection,readLlmConnections,selectLlmConnection} from './llmConnections';
import {readSettings,saveSettings} from './storage';
const values=new Map<string,string>();
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(),setItemAsync:jest.fn()}));
test('audit reproduction: eight revoked connections permanently exhaust new connection slots',async()=>{
 jest.mocked(SecureStore.getItemAsync).mockImplementation(async key=>values.get(key)??null);
 jest.mocked(SecureStore.setItemAsync).mockImplementation(async(key,value)=>{values.set(key,value);});
 for(let i=0;i<8;i++){
  const id=await saveLlmConnection({title:'offline-'+i,endpoint:'https://example.com/v1',model:'test',apiKey:'offline-test-only',images:false});
  await revokeLlmConnection(id);
 }
 expect((await readLlmConnections()).items.every(item=>item.revoked)).toBe(true);
 await expect(saveLlmConnection({title:'replacement',endpoint:'https://example.com/v1',model:'test',apiKey:'offline-test-only',images:false})).rejects.toThrow('最多保存 8 个模型连接');
});
test('audit reproduction: explicit connections silently ignore saved reasoning effort',async()=>{
 values.clear();
 const id=await saveLlmConnection({title:'offline reasoning',endpoint:'https://example.com/v1',model:'gpt-5.1',apiKey:'offline-test-only',images:false});
 await selectLlmConnection(id);await saveSettings({llmReasoningEffort:'low'});
 expect(values.get('llm.reasoningEffort')).toBe('low');
 expect(await readSettings()).toMatchObject({llmConnectionId:id,llmModel:'gpt-5.1',llmReasoningEffort:'default'});
});
