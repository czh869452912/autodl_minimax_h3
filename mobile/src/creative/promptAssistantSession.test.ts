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
  expect(await readPromptSession('image:a')).toEqual([{role:'user',content:'second'}]);
  expect(await readPromptSession('image:b')).toEqual([{role:'user',content:'other draft'}]);
  expect(await readPromptSession('image:new')).toEqual([]);
  expect([...mockFiles.keys()].some(path=>path.endsWith('.tmp'))).toBe(false);
});
