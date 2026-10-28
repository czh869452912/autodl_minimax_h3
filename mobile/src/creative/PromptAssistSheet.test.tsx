jest.mock('@copilotkit/react-native/components',()=>({CopilotMarkdown:({content}:{content:string})=>require('react').createElement(require('react-native').Text,null,content)}));
import React from 'react';
import {act,create} from 'react-test-renderer';
import {Modal} from 'react-native';
import {PromptDiscussion as PromptAssistSheet} from './PromptAssistSheet';
import {defaultNovelAiDraft} from './novelAiProtocol';
const mockRun=jest.fn(),mockRead=jest.fn(),mockWrite=jest.fn(async(..._args:unknown[])=>undefined);
jest.mock('./promptAssistant',()=>({...jest.requireActual('./promptAssistant'),streamPromptAssistant:(...args:unknown[])=>mockRun(...args)}));
jest.mock('./promptAssistantSession',()=>({readPromptSession:(id:string)=>mockRead(id),writePromptSession:(...args:unknown[])=>mockWrite(...args as [])}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn()})}));
const button=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0];
beforeEach(()=>{jest.clearAllMocks();mockRead.mockResolvedValue([]);mockRun.mockResolvedValue({content:'保留主体，增加月光',proposal:{summary:'增强光线',prompt:'moonlit cabin'}});});

test('new characters require explicit adoption and cannot be appended twice from the same proposal',async()=>{
 mockRun.mockResolvedValue({content:'按人物拆分',proposal:{summary:'两个人物',addCharacters:[{prompt:'tennis player'},{prompt:'referee'}]}});
 let tree!:ReturnType<typeof create>;const apply=jest.fn();
 try{
  await act(async()=>{tree=create(<PromptAssistSheet sessionId="new-characters" prompt="" image={defaultNovelAiDraft} kind="image" onApply={()=>{}} onApplyPatch={apply} onClose={()=>{}}/>);});
  await act(async()=>button(tree,'将不同人物拆分为角色提示词').props.onPress());
  expect(apply).not.toHaveBeenCalled();
  act(()=>button(tree,'采用全部修改').props.onPress());
  expect(apply.mock.calls[0][0].characters).toHaveLength(2);
  expect(button(tree,'采用全部修改')).toBeUndefined();
 }finally{act(()=>tree?.unmount());}
});

test('long suggestions are readable before editing, can expand, and adopted patches stay compact',async()=>{
 const prompt='long scene description, '.repeat(100);
 mockRun.mockResolvedValue({content:'建议如下',proposal:{summary:'完整场景',prompt}});
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<PromptAssistSheet sessionId="long-answer" prompt="" kind="video" onApply={()=>{}} onClose={()=>{}}/>);});
  await act(async()=>button(tree,'润色，保留原意').props.onPress());
  const text=()=>tree.root.findAllByType(require('react-native').Text).find(n=>n.props.children===prompt)!;
  expect(text().props.numberOfLines).toBe(4);
  act(()=>button(tree,'展开完整描述').props.onPress());
  expect(text().props.numberOfLines).toBeUndefined();
  act(()=>button(tree,'采用描述').props.onPress());
  expect(tree.root.findAllByType(require('react-native').Text).some(n=>typeof n.props.children==='string'&&n.props.children.startsWith('已采用修改：'))).toBe(false);
  expect(mockWrite.mock.calls.at(-1)?.[1]).toEqual(expect.arrayContaining([expect.objectContaining({content:expect.stringContaining('已采用修改：')})]));
 }finally{act(()=>tree?.unmount());}
});
test('inline conversation supports follow-ups, explicit apply, undo and conflict protection',async()=>{
 let tree!:ReturnType<typeof create>;const apply=jest.fn(),close=jest.fn();
 const render=(prompt:string)=><PromptAssistSheet sessionId="draft-a" prompt={prompt} kind="video" onApply={apply} onClose={close}/>;
 try{
  await act(async()=>{tree=create(render('cabin'));});
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  await act(async()=>button(tree,'润色，保留原意').props.onPress());
  expect(apply).not.toHaveBeenCalled();
  act(()=>tree.update(render('other')));
  expect(button(tree,'采用描述').props.disabled).toBe(true);
  act(()=>tree.update(render('cabin')));
  act(()=>button(tree,'采用描述').props.onPress());
  expect(apply).toHaveBeenLastCalledWith('moonlit cabin');expect(close).not.toHaveBeenCalled();
  act(()=>tree.update(render('moonlit cabin')));
  act(()=>button(tree,'撤销上次采用').props.onPress());expect(apply).toHaveBeenLastCalledWith('cabin');
  act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='提示词修改方向'&&n.props.onChangeText)[0].props.onChangeText('减少月光'));
  await act(async()=>button(tree,'发送消息').props.onPress());
  expect(mockRun.mock.calls[1][1]).toEqual(expect.arrayContaining([expect.objectContaining({role:'assistant',proposal:expect.objectContaining({prompt:'moonlit cabin'})}),expect.objectContaining({content:'减少月光'})]));
 }finally{act(()=>tree?.unmount());}
});
test('reopening restores only the selected draft conversation',async()=>{
 mockRead.mockResolvedValue([{role:'user',content:'之前的构图要求'},{role:'assistant',content:'已记住'}]);let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<PromptAssistSheet sessionId="draft-b" prompt="" kind="video" onApply={jest.fn()} onClose={jest.fn()}/>);});expect(mockRead).toHaveBeenCalledWith('draft-b');expect(tree.root.findAllByType(require('react-native').Text).some(node=>node.props.children==='之前的构图要求')).toBe(true);}finally{act(()=>tree?.unmount());}
});
test('stop cancels the request and never exposes its late proposal',async()=>{
 let finish!:(value:any)=>void;mockRun.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<PromptAssistSheet sessionId="draft-c" prompt="cabin" kind="video" onApply={jest.fn()} onClose={jest.fn()}/>);});
 act(()=>button(tree,'润色，保留原意').props.onPress());act(()=>button(tree,'停止本轮').props.onPress());expect(mockRun.mock.calls[0][2].aborted).toBe(true);
 await act(async()=>finish({content:'late',proposal:{summary:'late',prompt:'late'}}));expect(button(tree,'采用全部修改')).toBeUndefined();
 }finally{act(()=>tree?.unmount());}
});
