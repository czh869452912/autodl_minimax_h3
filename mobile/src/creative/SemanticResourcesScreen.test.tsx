import React from 'react';
import {act,create} from 'react-test-renderer';
import {TextInput} from 'react-native';
import {ListAction} from '../ui/ListPageUI';
import {SemanticResourcesScreen} from './SemanticResourcesScreen';
import {CreativeAssetPicker} from './CreativeAssetPicker';
jest.mock('./CreativeAssetPicker',()=>({CreativeAssetPicker:()=>null}));
jest.mock('./AudioVersionPreview',()=>({AudioVersionPreview:()=>null}));
const mockExecute=jest.fn(async(..._args:any[])=>({status:'completed',value:{}}));
const mockEntity={id:'entity',project_id:'p',title:'Lead',kind:'character',revision:0,current_version_id:null as string|null};
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View}));
jest.mock('./useUnsavedChanges',()=>({useUnsavedChanges:()=>((next:()=>void)=>next())}));
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({projectId:'p'}),useRouter:()=>({back:jest.fn()}),useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
jest.mock('./runtime',()=>({creativeService:()=>({execute:mockExecute,shots:async()=>[{id:"shot",title:"Opening",revision:2}]})}));
const mockHistory={items:[{id:'v1',version_no:1,content:'Blue coat',references:[]}],next:null as number|null};
jest.mock('./semanticReads',()=>({readSemanticDetail:async()=>({entity:mockEntity,bindings:[],page:mockHistory,adopted:mockEntity.current_version_id?{id:'v1',version_no:1,content:'Blue coat',references:[]}:null}),readSemanticVersionPage:async()=>({items:[{id:'v0',version_no:0,content:'Older',references:[]}],next:null})}));
jest.mock('./semanticResources',()=>({readSemanticResources:async()=>({items:[mockEntity],nextCursor:null})}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getFirstAsync:async()=>mockEntity,getAllAsync:async(sql:string)=>sql.includes('SELECT id,version_no,content')?[{id:'v1',version_no:1,content:'Blue coat'}]:[]})}));
beforeEach(()=>{mockExecute.mockClear();mockEntity.current_version_id=null;mockHistory.items=[{id:"v1",version_no:1,content:"Blue coat",references:[]}];mockHistory.next=null;});
test('adopted version remains bindable outside the latest page and older versions can be loaded',async()=>{
 mockEntity.current_version_id='v1';mockHistory.items=Array.from({length:20},(_,i)=>({id:'v'+(21-i),version_no:21-i,content:'new',references:[]}));mockHistory.next=2;
 let tree!:ReturnType<typeof create>;try{
  await act(async()=>{tree=create(<SemanticResourcesScreen/>);});
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='Lead · 已有采用版本')!.props.onPress());
  expect(tree.root.findAllByType(ListAction).some(n=>n.props.label==='绑定到 Opening')).toBe(true);
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='更多历史版本')!.props.onPress());
  expect(tree.root.findAllByType(ListAction).some(n=>n.props.label==='采用版本 0')).toBe(true);
 }finally{act(()=>tree.unmount());}
});
test('binding and a failed save preserve the editing buffer',async()=>{
 mockEntity.current_version_id='v1';let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<SemanticResourcesScreen/>);});
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='Lead · 已有采用版本')!.props.onPress());
  act(()=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='设定内容')!.props.onChangeText('Keep this edit'));
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='绑定到 Opening')!.props.onPress());
  expect(tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='设定内容')!.props.value).toBe('Keep this edit');
  mockExecute.mockRejectedValueOnce(new Error('save failed'));
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='保存为待审版本')!.props.onPress());
  expect(tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='设定内容')!.props.value).toBe('Keep this edit');
 }finally{act(()=>tree.unmount());}
});
test('saving a semantic version does not implicitly adopt or bind it',async()=>{
 let tree!:ReturnType<typeof create>;try{
  await act(async()=>{tree=create(<SemanticResourcesScreen/>);});
  act(()=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='设定名称')!.props.onChangeText('Lead'));
  act(()=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='设定内容')!.props.onChangeText('Blue coat'));
  act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='添加图片参考')!.props.onPress());
  expect(tree.root.findByType(CreativeAssetPicker).props.restrictToProject).toBe(true);
  await act(async()=>tree.root.findByType(CreativeAssetPicker).props.onChoose({id:'image-version'}));
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='保存为待审版本')!.props.onPress());
  expect(mockExecute).toHaveBeenCalledTimes(1);
  expect(mockExecute.mock.calls[0][0]).toMatchObject({name:'semantic.create',payload:{projectId:'p',kind:'character',title:'Lead',content:'Blue coat',references:[{versionId:'image-version',purpose:'外观参考'}]}});
 }finally{act(()=>tree.unmount());}
});
test('adoption is an explicit action with current entity revision',async()=>{
 let tree!:ReturnType<typeof create>;try{
  await act(async()=>{tree=create(<SemanticResourcesScreen/>);});
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='Lead · 待审阅')!.props.onPress());
  expect(mockExecute).not.toHaveBeenCalled();
  act(()=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='设定内容')!.props.onChangeText('Unsaved revision'));
  act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='添加图片参考')!.props.onPress());
  await act(async()=>tree.root.findByType(CreativeAssetPicker).props.onChoose({id:'unsaved-reference'}));
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='采用版本 1')!.props.onPress());
  expect(mockExecute.mock.calls[0][0]).toEqual({name:'semantic.adopt',payload:{entityId:'entity',expectedRevision:0,versionId:'v1'}});
  expect(tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='设定内容')!.props.value).toBe('Unsaved revision');
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='保存为待审版本')!.props.onPress());
  expect(mockExecute.mock.calls[1][0]).toMatchObject({name:'semantic.revise',payload:{content:'Unsaved revision',references:[{versionId:'unsaved-reference',purpose:'外观参考'}]}});
 }finally{act(()=>tree.unmount());}
});
