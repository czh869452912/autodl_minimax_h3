import * as SecureStore from 'expo-secure-store';
import {saveLlmConnection,selectLlmConnection,revokeLlmConnection,activeLlmConnection,assertLlmConnection,readLlmConnections} from './llmConnections';
import {readSettings} from './storage';
const values=new Map<string,string>();
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(),setItemAsync:jest.fn()}));
beforeEach(()=>{values.clear();jest.mocked(SecureStore.getItemAsync).mockImplementation(async k=>values.get(k)??null);jest.mocked(SecureStore.setItemAsync).mockImplementation(async(k,v)=>{values.set(k,v);});});
test('explicit connection selection preserves legacy settings, generations and prevents revoked fallback',async()=>{
 values.set('llm.apiKey','legacy');values.set('llm.model','legacy-model');
 const a=await saveLlmConnection({title:'a',endpoint:'https://example.com/v1',model:'model-a',apiKey:'secret-a',images:true});
 const b=await saveLlmConnection({title:'b',endpoint:'https://example.org/v1',model:'model-b',apiKey:'secret-b',images:false});
 expect(await activeLlmConnection()).toBeUndefined();await selectLlmConnection(a);
 expect(await readSettings()).toMatchObject({llmModel:'model-a',llmSupportsImages:true,llmConnectionRevision:1});
 await selectLlmConnection(b);await expect(assertLlmConnection({connectionId:a,connectionRevision:1})).resolves.toBeUndefined();
 await revokeLlmConnection(b);expect((await readSettings()).llmApiKey).toBe('');expect((await readLlmConnections()).active).toBe(b);
 await expect(assertLlmConnection({connectionId:b,connectionRevision:1})).rejects.toThrow('REVOKED');
 await selectLlmConnection(null);expect((await readSettings()).llmModel).toBe('legacy-model');
});
test('saving connections validates HTTPS and serializes concurrent updates',async()=>{
 await expect(saveLlmConnection({title:'bad',endpoint:'http://example.com',model:'model',apiKey:'secret',images:false})).rejects.toThrow();
 await Promise.all(['a','b'].map(title=>saveLlmConnection({title,endpoint:'https://example.com/v1',model:title,apiKey:'secret',images:false})));
 expect((await readLlmConnections()).items).toHaveLength(2);
});
