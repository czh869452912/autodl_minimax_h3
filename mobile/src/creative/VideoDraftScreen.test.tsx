import React from 'react';
import { act, create } from 'react-test-renderer';
import { VideoDraftScreen } from './VideoDraftScreen';
import { RESOLUTION_OPTIONS } from '../create/resolutions';
import {Alert,TextInput} from 'react-native';
const mockPick = jest.fn();
const mockExecute = jest.fn(async(command:any)=>{if(command.name==='draft.copySubmitted'){mockPrevious.push(mockDraft);mockDraft={...mockDraft,id:'next',job_id:null,state:'EDITING',revision:0};return {status:'completed',value:{draftId:'next'}};}mockDraft={...mockDraft,input_json:JSON.stringify(command.payload.input),revision:mockDraft.revision+1};return {status:'completed',value:{}};});
const mockImport = jest.fn();
let mockDraft:any,mockPrevious:any[]=[];
const mockPrepare=jest.fn(async()=>({})),mockConfirm=jest.fn(async()=>{mockDraft={...mockDraft,state:'SUBMITTED',job_id:'video-job',target_asset_id:'asset'};});
jest.mock('./runtime', () => ({ creativeService: () => ({ draft: async () => mockDraft, drafts:async()=>[mockDraft,...mockPrevious], draftInputs: async () => [], execute: mockExecute }), importCreativeImage: (...args: any[]) => mockImport(...args), creativeFiles: () => ({ verify: jest.fn() }) }));
jest.mock('../native/imagePicker', () => ({ pickImagesFromGallery: () => mockPick() }));
jest.mock('./videoRuntime', () => ({ prepareCreativeVideo:()=>mockPrepare(), confirmCreativeVideo:()=>mockConfirm() }));
jest.mock('./CreativeResults', () => ({ CreativeResults: () => null }));
jest.mock('./CreativeAccountPanel', () => ({ CreativeAccountPanel: () => null }));
jest.mock('./DraftHeading', () => ({ DraftHeading: () => null }));
jest.mock('./CopySubmittedDraft', () => ({ CopySubmittedDraft: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({}), usePreventRemove: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
beforeEach(()=>{jest.clearAllMocks();mockPrevious=[];mockDraft={id:'d',provider_id:'autodl',state:'EDITING',revision:1,project_id:null,shot_id:null,input_json:JSON.stringify({schemaVersion:1,prompt:'',resolution:RESOLUTION_OPTIONS[0],duration:5,seed:''})};});

test('reference import locks duplicate taps and editing until picker cancellation', async () => {
  let release!: (images: unknown[]) => void;
  mockPick.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  let tree!: ReturnType<typeof create>;
  const button = () => tree.root.findAll(n => n.props.accessibilityLabel === '导入参考图' && typeof n.props.onPress === 'function')[0];
  try {
    await act(async () => { tree = create(<VideoDraftScreen id="d" />); });
    act(() => { const onPress = button().props.onPress; onPress(); onPress(); });
    expect(mockPick).toHaveBeenCalledTimes(1);
    expect(tree.root.findByProps({ accessibilityLabel: '视频镜头提示词' }).props.editable).toBe(false);
    await act(async () => release([]));
    expect(tree.root.findByProps({ accessibilityLabel: '视频镜头提示词' }).props.editable).toBe(true);
    expect(mockImport).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  } finally { act(() => tree?.unmount()); }
});

test('video submits once directly, stays on its canvas and saves the next description without altering the running request',async()=>{
  jest.useFakeTimers();const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>undefined);let tree!:ReturnType<typeof create>;
  const button=()=>tree.root.findAll(n=>n.props.accessibilityLabel==='生成视频' && typeof n.props.onPress==='function')[0];
  try{
    await act(async()=>{tree=create(<VideoDraftScreen id="d" />);});
    const prompt=()=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='视频镜头提示词')!;
    act(()=>prompt().props.onChangeText('Camera pushes in'));
    await act(async()=>{button().props.onPress();button().props.onPress();});
    expect(mockPrepare).toHaveBeenCalledTimes(1);expect(mockConfirm).toHaveBeenCalledTimes(1);expect(alert).not.toHaveBeenCalled();
    const results=()=>tree.root.findByType(require('./CreativeResults').CreativeResults);
    act(()=>results().props.onJobStatus('RUNNING'));
    expect(prompt().props.editable).toBe(true);
    act(()=>prompt().props.onChangeText('Next shot'));
    await act(async()=>jest.advanceTimersByTime(650));
    expect(JSON.parse(mockPrevious[0].input_json).prompt).toBe('Camera pushes in');
    expect(JSON.parse(mockDraft.input_json).prompt).toBe('Next shot');
    expect(results().props.draft.job_id).toBe('video-job');expect(button().props.disabled).toBe(true);
    await act(async()=>button().props.onPress());expect(mockConfirm).toHaveBeenCalledTimes(1);
  }finally{act(()=>tree?.unmount());alert.mockRestore();jest.useRealTimers();}
});

test('an unknown video remains investigable while edits cannot authorize another request',async()=>{
  mockDraft={...mockDraft,state:'SUBMITTED',job_id:'unknown',target_asset_id:'asset'};let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<VideoDraftScreen id="d" />);});
    act(()=>tree.root.findByType(require('./CreativeResults').CreativeResults).props.onJobStatus('UNKNOWN'));
    const button=tree.root.findAll(n=>n.props.accessibilityLabel==='生成视频' && typeof n.props.onPress==='function')[0];
    expect(button.props.disabled).toBe(true);await act(async()=>button.props.onPress());expect(mockPrepare).not.toHaveBeenCalled();expect(mockConfirm).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});
