import React from 'react';
import {act,create} from 'react-test-renderer';
import {PromptAssistSheet} from './PromptAssistSheet';
import {readDiscussions,newDiscussion,writeDiscussions} from './promptDiscussions';
const mockFiles=new Map<string,string>(),mockRun=jest.fn();
jest.mock('expo-file-system/legacy',()=>({documentDirectory:'file:///docs/',makeDirectoryAsync:async()=>undefined,getInfoAsync:async(p:string)=>({exists:mockFiles.has(p)}),readAsStringAsync:async(p:string)=>mockFiles.get(p),writeAsStringAsync:async(p:string,v:string)=>{mockFiles.set(p,v);},moveAsync:async({from,to}:{from:string;to:string})=>{mockFiles.set(to,mockFiles.get(from)!);mockFiles.delete(from);},deleteAsync:async(p:string)=>{mockFiles.delete(p);}}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn()})}));
jest.mock('./promptAssistant',()=>({...jest.requireActual('./promptAssistant'),streamPromptAssistant:(...args:unknown[])=>mockRun(...args)}));
const button=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&n.props.onPress)[0];
test('new discussion excludes old messages and ignores a late stream; switching restores original history',async()=>{
  let complete!:(value:any)=>void,tree!:ReturnType<typeof create>;
  mockRun.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;})).mockResolvedValue({content:'B response'});
  try{
    await act(async()=>{tree=create(<PromptAssistSheet sessionId="isolation" prompt="cabin" kind="video" onApply={()=>{}} onClose={()=>{}}/>);});
    act(()=>button(tree,'润色，保留原意').props.onPress());
    const old=mockRun.mock.calls[0];
    await act(async()=>button(tree,'新建讨论').props.onPress());
    expect(old[2].aborted).toBe(true);
    await act(async()=>{old[3]('late stream');complete({content:'late result',proposal:{summary:'late',prompt:'wrong'}});});
    expect(JSON.stringify(tree.toJSON())).not.toContain('late stream');
    expect(JSON.stringify(tree.toJSON())).not.toContain('late result');
    await act(async()=>button(tree,'精简重复描述').props.onPress());
    expect(mockRun.mock.calls[1][1]).toEqual([{role:'user',content:'精简重复描述'}]);
    act(()=>button(tree,'新讨论 2 ▾').props.onPress());
    await act(async()=>button(tree,'已有讨论').props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('润色，保留原意');
    expect(JSON.stringify(tree.toJSON())).not.toContain('B response');
  }finally{act(()=>tree?.unmount());}
});
test('index migration is repeatable, scope changes cannot inherit the same legacy history',async()=>{
  const a=await readDiscussions('scope-a','legacy-shared');
  expect(await readDiscussions('scope-a','legacy-shared')).toEqual(a);
  const b=await readDiscussions('scope-b','legacy-shared');expect(b.active).not.toBe(a.active);
  const next=newDiscussion(a);await writeDiscussions('scope-a',next);
  expect(await readDiscussions('scope-a','legacy-shared')).toEqual(next);
  expect(next.items).toHaveLength(2);
});
