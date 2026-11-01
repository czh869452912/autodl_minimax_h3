/** Component state probe, not device UX acceptance. No real storage/provider writes. */
import React from 'react';
import {act,create} from 'react-test-renderer';
import {TextInput} from 'react-native';
import {ListAction} from '../ui/ListPageUI';
import {SemanticResourcesScreen} from './SemanticResourcesScreen';
const mockExecute=jest.fn(async(..._args:any[])=>({status:'completed',value:{}}));
const mockLeave=jest.fn((next:()=>void)=>next());
const mockEntity={id:'entity',project_id:'p',title:'Lead',kind:'character',revision:0,current_version_id:null as string|null};
let mockVersions=[{id:'v1',version_no:1,content:'Saved description'}];
jest.mock('./CreativeAssetPicker',()=>({CreativeAssetPicker:()=>null}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View}));
jest.mock('./useUnsavedChanges',()=>({useUnsavedChanges:()=>mockLeave}));
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({projectId:'p'}),useRouter:()=>({back:jest.fn()}),useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
jest.mock('./runtime',()=>({creativeService:()=>({execute:mockExecute,shots:async()=>[{id:'shot',title:'New shot',revision:0}]})}));
jest.mock('./semanticResources',()=>({readSemanticResources:async()=>({items:[mockEntity],nextCursor:null})}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getFirstAsync:async()=>mockEntity,getAllAsync:async(sql:string)=>sql.includes('SELECT id,version_no,content')?mockVersions:[]})}));
beforeEach(()=>{mockEntity.current_version_id=null;mockVersions=[{id:'v1',version_no:1,content:'Saved description'}];mockExecute.mockClear();mockLeave.mockClear();});

test('OBSERVED: adopting another saved version clears unsaved revision text without a leave guard',async()=>{
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<SemanticResourcesScreen/>);});
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='Lead · 待审阅')!.props.onPress());
  act(()=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='设定内容')!.props.onChangeText('Unsaved detailed revision'));
  mockLeave.mockClear();
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='采用版本 1')!.props.onPress());
  expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({name:'semantic.adopt'}),expect.any(String));
  expect(mockLeave).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='设定内容')!.props.value).toBe('');
 }finally{if(tree)act(()=>tree.unmount());}
});

test('OBSERVED: an adopted version older than the latest 20 loses all bind actions',async()=>{
 mockEntity.current_version_id='v1';
 mockVersions=Array.from({length:20},(_,i)=>({id:`v${21-i}`,version_no:21-i,content:'New pending revision'}));
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<SemanticResourcesScreen/>);});
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='Lead · 已有采用版本')!.props.onPress());
  expect(tree.root.findAllByType(ListAction).some(n=>n.props.label==='绑定到 New shot')).toBe(false);
  expect(tree.root.findAllByType(ListAction).some(n=>/更多版本|下一页/.test(n.props.label))).toBe(false);
 }finally{if(tree)act(()=>tree.unmount());}
});
