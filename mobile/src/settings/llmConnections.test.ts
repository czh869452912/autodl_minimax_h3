import {toH3AgentConfig} from '../agent/agentConfig';
import {pinRunRuntime} from '../agent/runSpecification';
import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import * as SecureStore from 'expo-secure-store';
import {clearRevokedLlmConnection,saveLlmConnection,selectLlmConnection,revokeLlmConnection,activeLlmConnection,assertLlmConnection,readLlmConnections} from './llmConnections';
import {readSettings,saveSettings} from './storage';
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

 test('ordinary full settings saves retain selected identity and never copy its secret to legacy settings',async()=>{
 const id=await saveLlmConnection({title:'vision',endpoint:'https://example.com/v1',model:'vision',apiKey:'test-secret',images:true});await selectLlmConnection(id);
 const settings=await readSettings();await saveSettings({...settings,autoExportToGallery:false});
 expect(await readSettings()).toMatchObject({llmConnectionId:id,llmConnectionRevision:1,llmSupportsImages:true,autoExportToGallery:false});
 expect(values.has('llm.apiKey')).toBe(false);
 await expect(saveSettings({llmModel:'different'})).rejects.toThrow('显式');
 expect((await readLlmConnections()).active).toBe(id);
 });

test('explicit connection effort survives persistence, Agent configuration and runtime specification; incompatible switching is rejected',async()=>{
 const id=await saveLlmConnection({title:'a',endpoint:'https://example.com/v1',model:'gpt-5.1',apiKey:'test',images:true});await selectLlmConnection(id);await saveSettings({llmReasoningEffort:'low'});
 const config=toH3AgentConfig(await readSettings());expect(config).toMatchObject({connectionId:id,reasoningEffort:'low'});
 const db=createInitializedRealSqliteTestDb();try{await pinRunRuntime(db as never,'t','r',config,'skill',[]);expect(JSON.parse(db.getFirstSync<{snapshot_json:string}>('SELECT snapshot_json FROM creative_run_runtime_specs')!.snapshot_json)).toMatchObject({connectionId:id,reasoningEffort:'low'});}finally{db.close();}
 const incompatible=await saveLlmConnection({title:'pro',endpoint:'https://example.com/v1',model:'gpt-5-pro',apiKey:'test',images:false});await expect(selectLlmConnection(incompatible)).rejects.toThrow('思考强度');expect((await readLlmConnections()).active).toBe(id);
 await saveSettings({llmReasoningEffort:'default'});await selectLlmConnection(incompatible);expect((await readSettings()).llmReasoningEffort).toBe('default');
});

test('more than eight credential rotations release slots without resurrecting old identities or implicit fallback',async()=>{
 values.set('llm.apiKey','legacy-secret');const old:string[]=[];
 for(let i=0;i<12;i++){const id=await saveLlmConnection({title:'rotation',endpoint:'https://example.com/v1',model:'gpt-5.1',apiKey:'secret-'+i,images:true});await selectLlmConnection(id);await expect(clearRevokedLlmConnection(id)).rejects.toThrow('已撤销');await revokeLlmConnection(id);expect((await readLlmConnections()).items.find(v=>v.id===id)?.apiKey).toBe('');await clearRevokedLlmConnection(id);expect((await readSettings()).llmApiKey).toBe('');expect((await readLlmConnections()).active).toBe(id);old.push(id);}
 expect((await readLlmConnections()).items).toHaveLength(0);expect((await readLlmConnections()).tombstones).toHaveLength(12);
 for(const id of old){await expect(assertLlmConnection({connectionId:id,connectionRevision:1})).rejects.toThrow('REVOKED');await expect(selectLlmConnection(id)).rejects.toThrow('UNAVAILABLE');}
 const next=await saveLlmConnection({title:'new',endpoint:'https://example.com/v1',model:'gpt-5.1',apiKey:'new-secret',images:true});expect((await readLlmConnections()).active).toBe(old.at(-1));await selectLlmConnection(next);expect((await readSettings()).llmApiKey).toBe('new-secret');
});
