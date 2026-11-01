import React from 'react';
import {act,create} from 'react-test-renderer';
import {Alert} from 'react-native';
import {ListAction} from '../ui/ListPageUI';
let mockPrevent=false,mockRemove:(event:any)=>void;
const mockDispatch=jest.fn(),mockPush=jest.fn();
const mockBack=jest.fn(()=>{if(mockPrevent)mockRemove({data:{action:{type:'GO_BACK'}}});else mockDispatch({type:'GO_BACK'});});
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({projectId:'p'}),useRouter:()=>({back:mockBack,push:mockPush})}));
jest.mock('expo-router/react-navigation',()=>({useNavigation:()=>({dispatch:mockDispatch}),usePreventRemove:(prevent:boolean,callback:any)=>{mockPrevent=prevent;mockRemove=callback;}}));
jest.mock('react-native-safe-area-context',()=>require('react-native-safe-area-context/jest/mock').default);
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getAllAsync:async()=>[]})}));
jest.mock('./CreativeAssetPicker',()=>({CreativeAssetPicker:()=>null}));
jest.mock('./mediaInspectionRuntime',()=>({inspectProjectMedia:jest.fn(),prepareInspectionReview:jest.fn(),sendInspectionReview:jest.fn()}));
jest.mock('../settings/llmConnections',()=>({activeLlmConnection:jest.fn()}));
jest.mock('./fileImport',()=>({saveCreativeText:jest.fn()}));
import {MediaReviewScreen} from './MediaReviewScreen';
import {prepareInspectionReview,sendInspectionReview} from './mediaInspectionRuntime';
it.each(['header','system'])('protects edited requirements on %s Back and only discards explicitly',async(source)=>{
 mockDispatch.mockClear();mockPush.mockClear();const alert=jest.spyOn(Alert,'alert');let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<MediaReviewScreen/>);});
  const input=()=>tree.root.findByProps({accessibilityLabel:'检查要求'});
  act(()=>input().props.onChangeText('unsaved requirements'));
  const press=(label:string)=>tree.root.findAllByType(ListAction).find(n=>n.props.label===label)!.props.onPress();
  act(()=>press('配置检查模型'));expect(mockPush).toHaveBeenCalledWith('/model-connections');expect(input().props.value).toBe('unsaved requirements');
  act(()=>{if(source==='header')press('返回来源');else mockRemove({data:{action:{type:'GO_BACK'}}});});
  expect(mockDispatch).not.toHaveBeenCalled();expect(alert).toHaveBeenLastCalledWith('尚有未保存的修改',expect.any(String),expect.any(Array));
  const choices=alert.mock.calls.at(-1)![2]!;
  act(()=>choices.find(b=>b.text==='继续编辑')?.onPress?.());expect(input().props.value).toBe('unsaved requirements');expect(mockDispatch).not.toHaveBeenCalled();
  act(()=>choices.find(b=>b.text==='放弃修改')!.onPress!());expect(mockDispatch).toHaveBeenCalledWith({type:'GO_BACK'});
  expect(prepareInspectionReview).not.toHaveBeenCalled();expect(sendInspectionReview).not.toHaveBeenCalled();
 }finally{act(()=>tree?.unmount());alert.mockRestore();}
});
