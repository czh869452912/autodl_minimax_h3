import React from 'react';
import {act,create} from 'react-test-renderer';
import {TextInput} from 'react-native';
import {ListAction} from '../ui/ListPageUI';
import {SemanticResourcesScreen} from './SemanticResourcesScreen';
import {CreativeAssetPicker} from './CreativeAssetPicker';
jest.mock('./CreativeAssetPicker',()=>({CreativeAssetPicker:()=>null}));
const mockExecute=jest.fn(async(..._args:any[])=>({status:'completed',value:{}}));
const mockEntity={id:'entity',project_id:'p',title:'Lead',kind:'character',revision:0,current_version_id:null};
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View}));
jest.mock('./useUnsavedChanges',()=>({useUnsavedChanges:()=>((next:()=>void)=>next())}));
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({projectId:'p'}),useRouter:()=>({back:jest.fn()}),useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
jest.mock('./runtime',()=>({creativeService:()=>({execute:mockExecute,shots:async()=>[]})}));
jest.mock('./semanticResources',()=>({readSemanticResources:async()=>({items:[mockEntity],nextCursor:null})}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getFirstAsync:async()=>mockEntity,getAllAsync:async(sql:string)=>sql.includes('SELECT id,version_no,content')?[{id:'v1',version_no:1,content:'Blue coat'}]:[]})}));
beforeEach(()=>mockExecute.mockClear());
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
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='采用版本 1')!.props.onPress());
  expect(mockExecute.mock.calls[0][0]).toEqual({name:'semantic.adopt',payload:{entityId:'entity',expectedRevision:0,versionId:'v1'}});
 }finally{act(()=>tree.unmount());}
});
