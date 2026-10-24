import React from 'react';
import {act,create} from 'react-test-renderer';
import {Alert} from 'react-native';
import {UpscaleDraftScreen} from './UpscaleDraftScreen';
const mockPrepare=jest.fn(),mockConfirm=jest.fn(),mockPrevent=jest.fn();
let mockState='EDITING';
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn()})}));
jest.mock('expo-router/react-navigation',()=>({usePreventRemove:(...args:unknown[])=>mockPrevent(...args)}));
jest.mock('./runtime',()=>({creativeService:()=>({draft:async()=>({id:'draft',provider_id:'novelai',state:mockState,input_json:JSON.stringify({operation:'upscale',sourceVersionId:'source'})}),draftInputs:async()=>[{version_id:'source',state:'AVAILABLE',relative_path:'source.png'}]})}));
jest.mock('./novelAiRuntime',()=>({prepareCreativeImage:(id:string)=>mockPrepare(id),confirmCreativeImage:(p:unknown)=>mockConfirm(p)}));
jest.mock('./DraftHeading',()=>({DraftHeading:()=>null}));
jest.mock('./CreativeResults',()=>({CreativeResults:()=>null}));
jest.mock('./CopySubmittedDraft',()=>({CopySubmittedDraft:()=>null}));
jest.mock('./CreativeAccountPanel',()=>({CreativeAccountPanel:()=>null}));
const button=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label && typeof n.props.onPress==='function')[0];
test('upscale submits once on an explicit click without an intermediate confirmation',async()=>{
  jest.clearAllMocks();mockState='EDITING';const preview={prepared:{inputSnapshot:{width:832,height:1216}}};mockPrepare.mockResolvedValue(preview);mockConfirm.mockImplementation(async()=>{mockState='SUBMITTED';});
  const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<UpscaleDraftScreen id="draft" />);});expect(mockPrepare).not.toHaveBeenCalled();expect(mockConfirm).not.toHaveBeenCalled();
    await act(async()=>{button(tree,'超分此图片').props.onPress();button(tree,'超分此图片').props.onPress();});
    expect(mockPrepare).toHaveBeenCalledTimes(1);expect(alert).not.toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledTimes(1);expect(mockConfirm).toHaveBeenCalledWith(preview);expect(button(tree,'超分此图片')).toBeUndefined();
  }finally{act(()=>tree?.unmount());alert.mockRestore();}
});
