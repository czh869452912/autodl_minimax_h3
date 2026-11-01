/** Review probe: asserts observed undesirable behavior, not acceptance criteria. */
import * as SecureStore from 'expo-secure-store';
import {saveLlmConnection,selectLlmConnection,readLlmConnections} from './llmConnections';
import {readSettings,saveSettings} from './storage';
const values=new Map<string,string>();
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(),setItemAsync:jest.fn()}));
test('OBSERVED: saving a playback preference through the full settings form deselects the explicit image connection',async()=>{
 jest.mocked(SecureStore.getItemAsync).mockImplementation(async k=>values.get(k)??null);
 jest.mocked(SecureStore.setItemAsync).mockImplementation(async(k,v)=>{values.set(k,v);});
 const id=await saveLlmConnection({title:'Review',endpoint:'https://example.com/v1',model:'image-capable',apiKey:'offline-placeholder',images:true});
 await selectLlmConnection(id);
 const before=await readSettings();expect(before.llmConnectionId).toBe(id);expect(before.llmSupportsImages).toBe(true);
 await saveSettings({...before,videoDecodeMode:'compatible'});
 expect((await readLlmConnections()).active).toBeNull();
 const after=await readSettings();expect(after.llmConnectionId).toBeUndefined();expect(after.llmSupportsImages).toBeUndefined();
 expect(after.llmModel).toBe('image-capable');
});
