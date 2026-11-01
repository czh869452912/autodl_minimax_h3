/** Review probe: asserts observed undesirable behavior, not acceptance criteria. */
import React from 'react';
import {act,create} from 'react-test-renderer';
import {TextInput} from 'react-native';
import {ListAction} from '../ui/ListPageUI';
const mockPush=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,back:jest.fn()}),useLocalSearchParams:()=>({projectId:'project'})}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({})}));
jest.mock('./runtime',()=>({creativeService:()=>({})}));
jest.mock('./textContent',()=>({readCreativeText:jest.fn()}));
jest.mock('./projectSearch',()=>({rebuildSearchPage:jest.fn(),searchProject:async()=>({items:[{key:'asset:old',kind:'asset',objectId:'asset',versionId:'historical-version',title:'Match in old version',excerpt:'historical phrase'}]})}));
import {ProjectSearchScreen} from './ProjectSearchScreen';
test('OBSERVED: opening a historical asset search hit drops its exact version identity',async()=>{
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<ProjectSearchScreen/>);});
  act(()=>tree.root.findByType(TextInput).props.onChangeText('historical'));
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='搜索')!.props.onPress());
  act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='查看来源')!.props.onPress());
  expect(mockPush).toHaveBeenCalledWith({pathname:'/creative-asset/[id]',params:{id:'asset'}});
  expect(mockPush.mock.calls[0][0].params.versionId).toBeUndefined();
 }finally{act(()=>tree?.unmount());}
});
