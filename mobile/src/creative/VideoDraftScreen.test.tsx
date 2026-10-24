import React from 'react';
import { act, create } from 'react-test-renderer';
import { VideoDraftScreen } from './VideoDraftScreen';
import { RESOLUTION_OPTIONS } from '../create/resolutions';
import {Alert,TextInput} from 'react-native';
const mockPick = jest.fn();
const mockExecute = jest.fn(async(command:any)=>{
  const source=[mockDraft,...mockPrevious].find(row=>row.id===command.payload.id);
  if(source&&source.id!==mockDraft.id){mockPrevious=[mockDraft,...mockPrevious.filter(row=>row.id!==source.id)];mockDraft=source;}
  if(command.name==='draft.copySubmitted'||command.name==='draft.switchVideoWorkflow'){mockPrevious.unshift(mockDraft);mockDraft={...mockDraft,id:`next-${mockPrevious.length}`,job_id:null,state:'EDITING',revision:0,...(command.name==='draft.switchVideoWorkflow'?{workflow_id:command.payload.input.workflow.id,input_json:JSON.stringify(command.payload.input)}:{})};return {status:'completed',value:{draftId:mockDraft.id}};}
  mockDraft={...mockDraft,input_json:JSON.stringify(command.payload.input),revision:mockDraft.revision+1};return {status:'completed',value:{}};
});
const mockImport = jest.fn();
let mockDraft:any,mockPrevious:any[]=[],mockEntries:any[]=[];
const mockPrepare=jest.fn(async()=>({})),mockConfirm=jest.fn(async()=>{mockDraft={...mockDraft,state:'SUBMITTED',job_id:'video-job',target_asset_id:'asset'};});
jest.mock('./runtime', () => ({ creativeService: () => ({ draft: async (id:string) => [mockDraft,...mockPrevious].find(row=>row.id===id), drafts:async()=>[mockDraft,...mockPrevious], draftInputs: async () => [], execute: mockExecute }), importCreativeImage: (...args: any[]) => mockImport(...args), creativeFiles: () => ({ verify: jest.fn(),read:async()=>({mime:'image/png'}) }) }));
jest.mock('./videoWorkbenchWorkflows',()=>({
  listVideoWorkflows:async()=>mockEntries,videoAccountReady:async()=>true,rememberVideoWorkflow:async()=>undefined,
  resolveVideoWorkbench:async(row:any)=>{
    const entry=mockEntries.find(item=>item.record.workflowId===row.workflow_id),raw=JSON.parse(row.input_json);
    if(!entry)throw new Error('工作流不可用');
    const resolved=raw.schemaVersion===2?{input:raw,notices:[]}:require('./videoDraftState').alignVideoState(entry.record,entry.definition,row.target_asset_id??row.id,raw);
    return {...resolved,entry,stale:false};
  },
}));
jest.mock('../native/imagePicker', () => ({ pickImagesFromGallery: () => mockPick() }));
jest.mock('./videoRuntime', () => ({ prepareCreativeVideo:()=>mockPrepare(), confirmCreativeVideo:()=>mockConfirm() }));
jest.mock('./CreativeResults', () => ({ CreativeResults: () => null }));
jest.mock('./CreativeAccountPanel', () => ({ CreativeAccountPanel: () => null }));
jest.mock('./DraftHeading', () => ({ DraftHeading: () => null }));
jest.mock('./CopySubmittedDraft', () => ({ CopySubmittedDraft: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({}), usePreventRemove: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
beforeEach(()=>{jest.clearAllMocks();mockPrevious=[];const definition=require('../workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json');mockEntries=[{definition,record:{workflowId:definition.id,version:definition.version,contentHash:'hash'},reason:''}];mockDraft={id:'d',provider_id:'autodl',workflow_id:definition.id,state:'EDITING',revision:1,project_id:null,shot_id:null,target_asset_id:null,input_json:JSON.stringify({schemaVersion:1,prompt:'',resolution:RESOLUTION_OPTIONS[0],duration:5,seed:''})};});

test('reference import locks duplicate taps and editing until picker cancellation', async () => {
  let release!: (images: unknown[]) => void;
  mockPick.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  let tree!: ReturnType<typeof create>;
  const button = () => tree.root.findAll(n => n.props.accessibilityLabel === '导入参考图' && typeof n.props.onPress === 'function')[0];
  try {
    await act(async () => { tree = create(<VideoDraftScreen id="d" />); });
    await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='添加参考图'&&typeof n.props.onPress==='function')[0].props.onPress());
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
    await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='准备下一次'&&typeof n.props.onPress==='function')[0].props.onPress());
    expect(prompt().props.editable).toBe(true);
    act(()=>prompt().props.onChangeText('Next shot'));
    await act(async()=>jest.advanceTimersByTime(650));
    expect(JSON.parse(mockPrevious[0].input_json).values.prompt).toBe('Camera pushes in');
    expect(JSON.parse(mockDraft.input_json).values.prompt).toBe('Next shot');
    expect(results().props.draft.job_id).toBe('video-job');expect(button().props.disabled).toBe(true);
    await act(async()=>button().props.onPress());expect(mockConfirm).toHaveBeenCalledTimes(1);
    act(()=>results().props.onJobStatus('SUCCEEDED'));
    expect(results().props.previewVisible).toBe(false);
    expect(prompt().props.value).toBe('Next shot');expect(button().props.disabled).toBe(false);
  }finally{act(()=>tree?.unmount());alert.mockRestore();jest.useRealTimers();}
});

test('switching workflows renders their own parameters and restores each saved draft without generating',async()=>{
  jest.useFakeTimers();let tree!:ReturnType<typeof create>;
  const second=JSON.parse(JSON.stringify(mockEntries[0]));second.record={...second.record,workflowId:'alternate.video',contentHash:'alternate'};second.definition.id='alternate.video';second.definition.metadata.title='另一个视频工作流';second.definition.inputs.properties.style={type:'string',title:'运动风格',enum:['smooth','fast'],default:'smooth'};mockEntries.push(second);
  const button=(label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0];
  const prompt=()=>tree.root.findByProps({accessibilityLabel:'视频镜头提示词'});
  try{
    await act(async()=>{tree=create(<VideoDraftScreen id="d"/>);});
    act(()=>prompt().props.onChangeText('H3 motion'));
    await act(async()=>jest.advanceTimersByTime(650));
    act(()=>button('MiniMax H3 · 切换').props.onPress());
    await act(async()=>button('选择工作流 另一个视频工作流').props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('运动风格');
    act(()=>prompt().props.onChangeText('Alternate motion'));
    await act(async()=>jest.advanceTimersByTime(650));
    act(()=>button('另一个视频工作流 · 切换').props.onPress());
    await act(async()=>button('选择工作流 MiniMax H3 Image/Audio to Video').props.onPress());
    expect(prompt().props.value).toBe('H3 motion');
    act(()=>button('MiniMax H3 · 切换').props.onPress());
    await act(async()=>button('选择工作流 另一个视频工作流').props.onPress());
    expect(prompt().props.value).toBe('Alternate motion');
    expect(mockExecute.mock.calls.filter(([command])=>command.name==='draft.switchVideoWorkflow')).toHaveLength(1);
    expect(mockPrepare).not.toHaveBeenCalled();expect(mockConfirm).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());jest.useRealTimers();}
});

test('an unknown video remains investigable while edits cannot authorize another request',async()=>{
  mockDraft={...mockDraft,state:'SUBMITTED',job_id:'unknown',target_asset_id:'asset'};let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<VideoDraftScreen id="d" />);});
    act(()=>tree.root.findByType(require('./CreativeResults').CreativeResults).props.onJobStatus('UNKNOWN'));
    await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='准备下一次'&&typeof n.props.onPress==='function')[0].props.onPress());
    const button=tree.root.findAll(n=>n.props.accessibilityLabel==='生成视频' && typeof n.props.onPress==='function')[0];
    expect(button.props.disabled).toBe(true);await act(async()=>button.props.onPress());expect(mockPrepare).not.toHaveBeenCalled();expect(mockConfirm).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});

test('switching back to an immutable legacy submission restores its own input in an editable copy',async()=>{
  let tree!:ReturnType<typeof create>;
  mockDraft={...mockDraft,state:'SUBMITTED',job_id:'original-job',target_asset_id:'asset',input_json:JSON.stringify({schemaVersion:1,prompt:'Original motion',resolution:'480p横',duration:7,seed:'42'})};
  const second=JSON.parse(JSON.stringify(mockEntries[0]));second.record={...second.record,workflowId:'alternate.video',contentHash:'alternate'};second.definition.id='alternate.video';second.definition.metadata.title='Alternate';mockEntries.push(second);
  const button=(label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0];
  try{
    await act(async()=>{tree=create(<VideoDraftScreen id="d"/>);});
    act(()=>tree.root.findByType(require('./CreativeResults').CreativeResults).props.onJobStatus('SUCCEEDED'));
    act(()=>button('调整后再生成').props.onPress());
    act(()=>button('MiniMax H3 · 切换').props.onPress());await act(async()=>button('选择工作流 Alternate').props.onPress());
    act(()=>button('Alternate · 切换').props.onPress());await act(async()=>button('选择工作流 MiniMax H3 Image/Audio to Video').props.onPress());
    expect(tree.root.findByProps({accessibilityLabel:'视频镜头提示词'}).props.value).toBe('Original motion');
    expect(mockDraft.state).toBe('EDITING');expect(JSON.parse(mockDraft.input_json)).toMatchObject({duration:7,seed:'42'});
    expect(mockPrevious.find(row=>row.id==='d')).toMatchObject({state:'SUBMITTED',job_id:'original-job'});
    expect(mockConfirm).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});
