import React from 'react';
import { act, create } from 'react-test-renderer';
import { CreativeHome } from './CreativeHome';
import { defaultNovelAiDraft } from './novelAiProtocol';
let mockRows:any[]=[],mockCanLeave=true;
const mockStore:Record<string,string>={};
const mockNavigate=jest.fn(),mockPush=jest.fn(),mockWrite=jest.fn(async(_value:unknown)=>undefined);
const mockExecute=jest.fn(async(command:any)=>{const row={id:`new-${mockRows.length}`,provider_id:command.name==='draft.createImage'?'novelai':'autodl',state:'EDITING',revision:0,input_json:JSON.stringify(command.payload.input??{prompt:command.payload.prompt})};mockRows.unshift(row);return {status:'completed',value:{draftId:row.id}};});
jest.mock('./creativeIdea',()=>({readCreativeIdea:async()=>({mode:'image',image:'Portrait',video:'Pan'}),writeCreativeIdea:(value:unknown)=>mockWrite(value)}));
jest.mock('./runtime',()=>({creativeService:()=>({drafts:async()=>mockRows,draft:async(id:string)=>mockRows.find(d=>d.id===id),versions:async()=>[],execute:mockExecute})}));
jest.mock('expo-secure-store',()=>({getItemAsync:async(key:string)=>mockStore[key]??null,setItemAsync:async(key:string,value:string)=>{mockStore[key]=value;}}));
jest.mock('./ImageDraftScreen',()=>({ImageDraftScreen:(props:any)=>{require('./WorkbenchUI').useWorkbenchLeave(async()=>mockCanLeave);return require('react').createElement(require('react-native').Text,{testID:'image-workbench'},props.id);}}));
jest.mock('./VideoDraftScreen',()=>({VideoDraftScreen:(props:any)=>require('react').createElement(require('react-native').Text,{testID:'video-workbench'},props.id)}));
jest.mock('./CreativeAccountPanel',()=>({CreativeAccountPanel:()=>null}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,navigate:mockNavigate}),useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
const button=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label && typeof n.props.onPress==='function')[0];
beforeEach(()=>{jest.clearAllMocks();mockRows=[];mockCanLeave=true;for(const key of Object.keys(mockStore))delete mockStore[key];});

test('first entry opens a workspace directly and transfers the legacy description only once',async()=>{
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<CreativeHome onLegacyVideo={()=>undefined}/>);});
  expect(tree.root.findByProps({testID:'image-workbench'}).props.children).toBe('new-0');
  expect(mockExecute).toHaveBeenCalledTimes(1);
  expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({name:'draft.createImage',payload:expect.objectContaining({input:expect.objectContaining({prompt:'Portrait'})})}),expect.any(String));
  expect(mockWrite).toHaveBeenLastCalledWith({mode:'image',image:'',video:'Pan'});
  expect(mockPush).not.toHaveBeenCalled();
 }finally{act(()=>tree.unmount());}
});

test('restores an existing workspace without creating blank drafts or replacing unsaved input on a mode switch',async()=>{
 mockRows=[{id:'image',provider_id:'novelai',revision:1,state:'EDITING',input_json:JSON.stringify(defaultNovelAiDraft)},{id:'video',provider_id:'autodl',revision:1,state:'EDITING',input_json:JSON.stringify({prompt:'Pan'})}];
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<CreativeHome onLegacyVideo={()=>undefined}/>);});
  expect(tree.root.findByProps({testID:'image-workbench'}).props.children).toBe('image');
  mockCanLeave=false;
  await act(async()=>button(tree,'视频').props.onPress());
  expect(tree.root.findAllByProps({testID:'video-workbench'})).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('请等待输入保存');
  mockCanLeave=true;
  await act(async()=>{button(tree,'视频').props.onPress();button(tree,'视频').props.onPress();});
  expect(tree.root.findByProps({testID:'video-workbench'}).props.children).toBe('video');
  expect(mockExecute).not.toHaveBeenCalled();
 }finally{act(()=>tree.unmount());}
});

test('switching to Agent saves through the existing leave guard and does not create another draft',async()=>{
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<CreativeHome onLegacyVideo={()=>undefined}/>);});
    const calls=mockExecute.mock.calls.length;
    const switcher=()=>tree.root.findByType(require('../ui/WorkbenchModeSwitcher').WorkbenchModeSwitcher);
    mockCanLeave=false;
    await act(async()=>switcher().props.onSelect('agent'));
    expect(mockNavigate).not.toHaveBeenCalled();
    mockCanLeave=true;
    await act(async()=>switcher().props.onSelect('agent'));
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/agent');
    expect(mockExecute).toHaveBeenCalledTimes(calls);
  }finally{act(()=>tree?.unmount());}
});
