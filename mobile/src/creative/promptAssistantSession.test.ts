import {readPromptSession,writePromptSession} from './promptAssistantSession';
const mockFiles=new Map<string,string>();
jest.mock('expo-file-system/legacy',()=>({
  documentDirectory:'file:///documents/',
  makeDirectoryAsync:async()=>undefined,
  getInfoAsync:async(path:string)=>({exists:mockFiles.has(path)}),
  readAsStringAsync:async(path:string)=>mockFiles.get(path),
  writeAsStringAsync:async(path:string,value:string)=>{await Promise.resolve();mockFiles.set(path,value);},
  moveAsync:async({from,to}:{from:string;to:string})=>{mockFiles.set(to,mockFiles.get(from)!);mockFiles.delete(from);},
}));
test('serializes writes and restores only the selected draft discussion',async()=>{
  const first=writePromptSession('image:a',[{role:'user',content:'first'}]);
  const second=writePromptSession('image:a',[{role:'user',content:'second'}]);
  await writePromptSession('image:b',[{role:'user',content:'other draft'}]);
  await Promise.all([first,second]);
  expect(await readPromptSession('image:a')).toEqual([{id:expect.any(String),role:'user',content:'second'}]);
  expect(await readPromptSession('image:b')).toEqual([{id:expect.any(String),role:'user',content:'other draft'}]);
  expect(await readPromptSession('image:new')).toEqual([]);
  expect([...mockFiles.keys()].some(path=>path.endsWith('.tmp'))).toBe(false);
});

test('retains history beyond the model window with stable IDs and interrupts unfinished runs',async()=>{
  const messages=Array.from({length:60},(_,i)=>({role:'user' as const,content:`message ${i}`}));
  await writePromptSession('long',messages);
  const restored=await readPromptSession('long');
  expect(restored).toHaveLength(60);
  expect(new Set(restored.map(m=>m.id)).size).toBe(60);
  await writePromptSession('long',restored);
  expect(await readPromptSession('long')).toEqual(restored);
  await writePromptSession('interrupted',[{role:'assistant',content:'partial',run:{id:'r',userMessageId:'u',messageIds:[],startedAt:1,status:'running',tools:[{id:'t',name:'search_tags',startedAt:2,status:'running'}]}}]);
  expect((await readPromptSession('interrupted'))[0].run).toMatchObject({status:'interrupted',tools:[{status:'cancelled'}]});
});
