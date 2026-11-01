import React from 'react';
import {act,create} from 'react-test-renderer';
import {Alert,TextInput} from 'react-native';
import {ListAction} from '../ui/ListPageUI';
const mockBack=jest.fn();
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({projectId:'offline-project'}),useRouter:()=>({back:mockBack,push:jest.fn()})}));
jest.mock('expo-router/react-navigation',()=>({useNavigation:()=>({dispatch:jest.fn()}),usePreventRemove:jest.fn()}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getAllAsync:async()=>[]})}));
jest.mock('./CreativeAssetPicker',()=>({CreativeAssetPicker:()=>null}));
jest.mock('./mediaInspectionRuntime',()=>({inspectProjectMedia:jest.fn(),prepareInspectionReview:jest.fn(),sendInspectionReview:jest.fn()}));
jest.mock('../settings/llmConnections',()=>({activeLlmConnection:jest.fn()}));
jest.mock('./fileImport',()=>({saveCreativeText:jest.fn()}));
import {MediaReviewScreen} from './MediaReviewScreen';
test('audit: an edited media review prompt leaves without confirmation and resets on reentry',async()=>{
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<MediaReviewScreen/>);});
  const input=()=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='检查要求')!;
  const original=input().props.value;
  act(()=>input().props.onChangeText('offline review unsaved'));
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='返回项目')!.props.onPress());
  expect(mockBack).toHaveBeenCalledTimes(1);expect(alert).not.toHaveBeenCalled();
  act(()=>tree.unmount());await act(async()=>{tree=create(<MediaReviewScreen/>);});
  expect(input().props.value).toBe(original);
 }finally{act(()=>tree?.unmount());alert.mockRestore();}
});
