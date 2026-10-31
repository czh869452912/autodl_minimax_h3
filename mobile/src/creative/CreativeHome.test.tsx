import React from 'react';
import { act, create } from 'react-test-renderer';
import {PrimaryNavigationProvider,PrimaryTabBar} from '../navigation/PrimaryNavigation';
import { CreativeHome } from './CreativeHome';
import { defaultNovelAiDraft } from './novelAiProtocol';
jest.mock('./legacyCreativeHandoff',()=>({importLegacyCreativeDraft:jest.fn()}));
let mockRows:any[]=[],mockCanLeave=true;
const mockStore:Record<string,string>={};
const mockNavigate=jest.fn(),mockPush=jest.fn(),mockWrite=jest.fn(async(_value:unknown)=>undefined);
const mockExecute=jest.fn(async(command:any)=>{const row={id:`new-${mockRows.length}`,provider_id:command.name==='draft.createImage'?'novelai':'autodl',state:'EDITING',revision:0,input_json:JSON.stringify(command.payload.input??{prompt:command.payload.prompt})};mockRows.unshift(row);return {status:'completed',value:{draftId:row.id}};});
jest.mock('./creativeIdea',()=>({readCreativeIdea:async()=>({mode:'image',image:'Portrait',video:'Pan'}),writeCreativeIdea:(value:unknown)=>mockWrite(value)}));
jest.mock('./runtime',()=>({creativeService:()=>({drafts:async()=>mockRows,creationRecordPage:async()=>({items:require('./workbenchSessions').groupWorkbenchDrafts(mockRows,'image'),reset:false}),creationRecords:async()=>require('./workbenchSessions').groupWorkbenchDrafts(mockRows,'image'),draft:async(id:string)=>mockRows.find(d=>d.id===id),versions:async()=>[],execute:mockExecute})}));
jest.mock('expo-secure-store',()=>({getItemAsync:async(key:string)=>mockStore[key]??null,setItemAsync:async(key:string,value:string)=>{mockStore[key]=value;}}));
jest.mock('./ImageDraftScreen',()=>({ImageDraftScreen:(props:any)=>{require('./WorkbenchUI').useWorkbenchLeave(async()=>mockCanLeave);return require('react').createElement(require('react-native').Text,{testID:'image-workbench'},props.id);}}));
jest.mock('./VideoDraftScreen',()=>({VideoDraftScreen:(props:any)=>require('react').createElement(require('react-native').Text,{testID:'video-workbench'},props.id)}));
jest.mock('./CreativeAccountPanel',()=>({CreativeAccountPanel:()=>null}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,navigate:mockNavigate}),useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
const button=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label && typeof n.props.onPress==='function')[0];
beforeEach(()=>{jest.clearAllMocks();mockRows=[];mockCanLeave=true;for(const key of Object.keys(mockStore))delete mockStore[key];});

test('an explicit video request opens video even when the remembered mode is image and is consumed once',async()=>{
 mockRows=[{id:'video',provider_id:'autodl',state:'EDITING',input_json:'{}'}];
 const consumed=jest.fn(),request={kind:'recent' as const,mode:'video' as const,requestId:'r'};
 let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<CreativeHome openRequest={request} onRequestConsumed={consumed}/>);});
 expect(tree.root.findByProps({testID:'video-workbench'}).props.children).toBe('video');
 expect(mockExecute).not.toHaveBeenCalled();expect(consumed).toHaveBeenCalledTimes(1);
 await act(async()=>tree.update(<CreativeHome openRequest={{...request}} onRequestConsumed={consumed}/>));
 expect(consumed).toHaveBeenCalledTimes(1);
 }finally{act(()=>tree?.unmount());}
});

test('failed save preserves the original canvas and an incoming draft can be retried',async()=>{
 mockRows=[{id:'a',provider_id:'novelai',state:'EDITING',input_json:'{}'},{id:'b',provider_id:'autodl',state:'EDITING',input_json:'{}'}];
 const consumed=jest.fn();let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<CreativeHome/>);});mockCanLeave=false;
 await act(async()=>tree.update(<CreativeHome openRequest={{kind:'draft',draftId:'b',requestId:'r'}} onRequestConsumed={consumed}/>));
 expect(consumed).not.toHaveBeenCalled();expect(tree.root.findByProps({testID:'image-workbench'}).props.children).toBe('a');
 mockCanLeave=true;await act(async()=>button(tree,'重试打开创作').props.onPress());
 expect(tree.root.findByProps({testID:'video-workbench'}).props.children).toBe('b');expect(consumed).toHaveBeenCalledTimes(1);
 }finally{act(()=>tree?.unmount());}
});

test('creation records route workflow management to current settings',async()=>{
 let tree!:ReturnType<typeof create>;
 try {
  await act(async()=>{tree=create(<CreativeHome/>);});
  await act(async()=>button(tree,'创作记录').props.onPress());
  await act(async()=>button(tree,'管理工作流').props.onPress());
  expect(mockPush).toHaveBeenCalledWith({pathname:'/settings-panel',params:{section:'workflows'}});
 }finally{act(()=>tree?.unmount());}
});

test('first entry opens a workspace directly and transfers the legacy description only once',async()=>{
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<CreativeHome/>);});
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
  await act(async()=>{tree=create(<CreativeHome/>);});
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
    await act(async()=>{tree=create(<PrimaryNavigationProvider><CreativeHome/><PrimaryTabBar state={{index:0,routes:[{name:'create',key:'create'},{name:'agent',key:'agent'}]}} navigation={{navigate:mockNavigate,emit:()=>({defaultPrevented:false})}}/></PrimaryNavigationProvider>);});
    const calls=mockExecute.mock.calls.length;

    mockCanLeave=false;
    await act(async()=>button(tree,'助手').props.onPress());
    expect(mockNavigate).not.toHaveBeenCalled();
    mockCanLeave=true;
    await act(async()=>button(tree,'助手').props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('agent');
    expect(mockExecute).toHaveBeenCalledTimes(calls);
  }finally{act(()=>tree?.unmount());}
});


test('a newer open request wins while an older import is pending',async()=>{
 mockRows=[{id:'a',provider_id:'novelai',state:'EDITING',input_json:'{}'},{id:'b',provider_id:'autodl',state:'EDITING',input_json:'{}'}];
 let resolve!:(value:unknown)=>void;
 require('./legacyCreativeHandoff').importLegacyCreativeDraft.mockReturnValue(new Promise(r=>{resolve=r;}));
 const consumed=jest.fn();let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<CreativeHome/>);});
  await act(async()=>tree.update(<CreativeHome openRequest={{kind:'legacy',legacyId:'old',requestId:'old'}} onRequestConsumed={consumed}/>));
  await act(async()=>tree.update(<CreativeHome openRequest={{kind:'draft',draftId:'b',requestId:'new'}} onRequestConsumed={consumed}/>));
  await act(async()=>resolve({id:'old-result',provider_id:'novelai',state:'EDITING'}));
  expect(tree.root.findByProps({testID:'video-workbench'}).props.children).toBe('b');
  expect(consumed).toHaveBeenCalledTimes(1);
 }finally{act(()=>tree?.unmount());}
});


test('a consumed request can be explicitly opened again without creating another draft',async()=>{
 mockRows=[{id:'a',provider_id:'novelai',state:'EDITING',input_json:'{}'},{id:'b',provider_id:'autodl',state:'EDITING',input_json:'{}'}];
 const request={kind:'draft' as const,draftId:'b',requestId:'same'};let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<CreativeHome openRequest={request}/>);});
  await act(async()=>tree.update(<CreativeHome/>));
  await act(async()=>button(tree,'图片').props.onPress());
  await act(async()=>tree.update(<CreativeHome openRequest={request}/>));
  expect(tree.root.findByProps({testID:'video-workbench'}).props.children).toBe('b');expect(mockExecute).not.toHaveBeenCalled();
 }finally{act(()=>tree?.unmount());}
});

test('a discarded record reports inside the sheet and preserves the current canvas',async()=>{
 jest.useFakeTimers();
 mockRows=[{id:'a',provider_id:'novelai',state:'EDITING',input_json:'{"prompt":"Original"}'},{id:'b',provider_id:'novelai',state:'EDITING',input_json:'{"prompt":"Other"}'}];
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<CreativeHome/>);});
  await act(async()=>button(tree,'创作记录').props.onPress());
  await act(async()=>jest.advanceTimersByTime(250));
  mockRows=mockRows.filter(row=>row.id!=='b');
  await act(async()=>button(tree,'Other').props.onPress());
  expect(tree.root.findByProps({testID:'image-workbench'}).props.children).toBe('a');
  const sheet=tree.root.findByType(require('./WorkbenchUI').ParameterSheet);
  expect(sheet.findAll(node=>node.props.accessibilityRole==='alert'&&node.props.children==='这份创作已不可用，请重新打开记录').length).toBeGreaterThan(0);
 }finally{act(()=>tree?.unmount());jest.useRealTimers();}
});
