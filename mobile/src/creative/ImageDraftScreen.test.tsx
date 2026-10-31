jest.mock('./accountRuntime',()=>({creativeAccounts:()=>({list:async()=>[{provider_id:'novelai'}]})}));
jest.mock('@copilotkit/react-native/components',()=>({CopilotMarkdown:({content}:{content:string})=>require('react').createElement(require('react-native').Text,null,content)}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({})}));
jest.mock('./taskRecovery',()=>({unknownTaskReviewed:async()=>mockReviewed}));
let mockReviewed=false;
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, Modal, NativeModules, StyleSheet, TextInput } from 'react-native';
import { ImageDraftScreen } from './ImageDraftScreen';
import { defaultNovelAiDraft } from './novelAiProtocol';
import { createEnhanceInput } from './novelAiEnhancement';

let mockDraft: any;
let mockPreparedInput:any;
let mockPrevious:any[]=[];
const mockExecute = jest.fn(async (command: any) => {
  if(command.name==='draft.copySubmitted'){mockPrevious.push(mockDraft);mockDraft={...mockDraft,id:'next-draft',revision:0,state:'EDITING',job_id:null};return {status:'completed',value:{draftId:mockDraft.id}};}
  mockDraft = { ...mockDraft, input_json: JSON.stringify(command.payload.input), revision: mockDraft.revision + 1 }; return { status: 'completed', value: {} };
});
const mockPrepare = jest.fn(async (_id: string) => {mockPreparedInput=JSON.parse(mockDraft.input_json);return { account: { credential_generation_id: 'test-account' }, prepared: { inputSnapshot: { seed: 1 } } };});
jest.mock('./runtime', () => ({ creativeService: () => ({ draft: async () => mockDraft, drafts:async()=>[mockDraft,...mockPrevious], versions:async()=>[], draftInputs: async () => [], execute: mockExecute }), creativeFiles: () => ({ verify: async () => ({ state: 'AVAILABLE' }) }) }));
jest.mock('./novelAiRuntime', () => ({ prepareCreativeImage: (id: string) => mockPrepare(id), confirmCreativeImage: jest.fn() }));
jest.mock('./CreativeResults', () => ({ CreativeResults: () => null }));
jest.mock('./NovelAiUsageBar', () => ({ NovelAiUsageBar: () => null }));
jest.mock('./CreativeAccountPanel', () => ({ CreativeAccountPanel: () => null }));
jest.mock('./DraftHeading', () => ({ DraftHeading: () => null }));
jest.mock('./CopySubmittedDraft', () => ({ CopySubmittedDraft: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({}), usePreventRemove: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();mockReviewed=false;
  mockDraft = { id: 'd', provider_id: 'novelai', state: 'EDITING', revision: 0, input_json: JSON.stringify(defaultNovelAiDraft) };
  mockPrevious=[];
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

test('canvas measurements around the compact threshold cannot resize the prompt and feed back into layout',async()=>{
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImageDraftScreen id="d"/>);});
    const field=()=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='图片提示词')!;
    const height=()=>StyleSheet.flatten(field().props.style).height;
    const initial=height();
    const canvas=tree.root.findAll(n=>n.props.testID==='image-workbench-canvas')[0];
    const measure=canvas.parent!.props.onLayout;
    for(const available of [476,484,479,481,476,484]){
      act(()=>measure({nativeEvent:{layout:{width:393,height:available,x:0,y:0}}}));
      expect(height()).toBe(initial);
    }
  }finally{act(()=>tree?.unmount());}
});

test('switching history exits Enhance and cannot submit the previously selected source',async()=>{
  NativeModules.AutoDLMedia={readCreativeImageInfo:jest.fn(async()=>({width:832,height:1216}))};
  mockDraft.input_json=JSON.stringify({...defaultNovelAiDraft,prompt:'next scene'});
  const source:any={id:'v2',assetId:'asset',versionNo:2,state:'AVAILABLE',relativePath:'2.png',recipe:{input:defaultNovelAiDraft}};
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImageDraftScreen id="d" />);});
    const results=()=>tree.root.findByType(require('./CreativeResults').CreativeResults);
    act(()=>results().props.onCurrentVersion(source));
    await act(async()=>results().props.onEnhance(source));
    expect(button(tree,'增强图片')).toBeDefined();
    act(()=>results().props.onCurrentVersion({...source,id:'v1',versionNo:1}));
    expect(button(tree,'增强图片')).toBeUndefined();
    expect(button(tree,'生成 1 张图片')).toBeDefined();
    expect(tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='图片提示词')?.props.value).toBe('next scene');
    expect(mockPrepare).not.toHaveBeenCalled();expect(mockExecute).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());delete NativeModules.AutoDLMedia;}
});

test('editing while a request runs forks input but keeps the original job visible and submission disabled',async()=>{
  mockDraft={...mockDraft,state:'SUBMITTED',job_id:'running-job',target_asset_id:'asset',input_json:JSON.stringify({...defaultNovelAiDraft,prompt:'submitted scene'})};
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImageDraftScreen id="d" />);});
    const results=()=>tree.root.findByType(require('./CreativeResults').CreativeResults);
    act(()=>results().props.onJobStatus('RUNNING'));
    const field=()=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='图片提示词')!;
    expect(field().props.editable).toBe(true);
    act(()=>field().props.onChangeText('next scene'));
    await act(async()=>jest.advanceTimersByTime(650));
    expect(JSON.parse(mockPrevious[0].input_json).prompt).toBe('submitted scene');
    expect(JSON.parse(mockDraft.input_json).prompt).toBe('next scene');
    expect(results().props.draft.job_id).toBe('running-job');
    expect(button(tree,'生成 1 张图片').props.disabled).toBe(true);
    await act(async()=>button(tree,'生成 1 张图片').props.onPress());
    expect(mockPrepare).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});

test('back closes inline settings before attempting to leave the workspace',async()=>{
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImageDraftScreen id="d" />);});
    act(()=>button(tree,'生成设置').props.onPress());
    const prevent=require('expo-router/react-navigation').usePreventRemove as jest.Mock;
    act(()=>prevent.mock.calls.at(-1)[1]({data:{action:{type:'GO_BACK'}}}));
    act(()=>jest.advanceTimersByTime(250));
    expect(button(tree,'关闭生成设置')).toBeUndefined();
    expect(Alert.alert).not.toHaveBeenCalled();expect(mockExecute).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});

test('settings, prompt and history switch in place while preserving the canvas and generation control',async()=>{
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImageDraftScreen id="d"/>);});
    const canvas=()=>tree.root.findAll(n=>n.props.testID==='image-workbench-canvas')[0];
    act(()=>button(tree,'生成设置').props.onPress());
    expect(canvas()).toBeDefined();expect(button(tree,'生成 1 张图片')).toBeDefined();
    expect(tree.root.findAllByType(Modal)).toHaveLength(0);
    act(()=>button(tree,'展开画面编辑').props.onPress());
    expect(button(tree,'关闭生成设置')).toBeUndefined();expect(button(tree,'关闭画面编辑')).toBeDefined();
    expect(canvas()).toBeDefined();expect(tree.root.findAllByType(Modal)).toHaveLength(0);
    act(()=>button(tree,'生成历史').props.onPress());
    act(()=>jest.advanceTimersByTime(250));
    expect(button(tree,'关闭画面编辑')).toBeUndefined();
    expect(tree.root.findByType(require('./CreativeResults').CreativeResults).props.historyVisible).toBe(true);
    expect(canvas()).toBeDefined();
  }finally{act(()=>tree?.unmount());}
});

test('closing a prepared enhancement persists ordinary input so returning does not reopen the discarded tool',async()=>{
  mockDraft.input_json=JSON.stringify(createEnhanceInput({...defaultNovelAiDraft,prompt:'scene'},'source',832,1216));
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImageDraftScreen id="d" />);});
    act(()=>button(tree,'关闭增强').props.onPress());
    await act(async()=>jest.advanceTimersByTime(650));
    expect(JSON.parse(mockDraft.input_json)).toMatchObject({action:'generate',enhance:false,enhancement:null,sourceVersionId:null,prompt:'scene'});
    expect(mockPrepare).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

const button=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label && typeof n.props.onPress==='function')[0];

test('Enhance keeps its prompt separate while ordinary settings persist to the manual draft', async () => {
  NativeModules.AutoDLMedia = { readCreativeImageInfo: jest.fn(async () => ({ width: 832, height: 1216 })) };
  mockDraft.input_json = JSON.stringify({ ...defaultNovelAiDraft, prompt: 'my next scene' });
  const source = { id: 'selected-original', assetId: 'asset', versionNo: 2, source: 'generated', state: 'AVAILABLE', relativePath: 'original.png', mime: 'image/png', recipe: { input: { ...defaultNovelAiDraft, prompt: 'original image' } } };
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<ImageDraftScreen id="d" />); });
    const resultsType = require('./CreativeResults').CreativeResults;
    await act(async () => { tree.root.findByType(resultsType).props.onEnhance(source); });
    const prompt = () => tree.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === '图片提示词')!;
    expect(prompt().props.value).toBe('original image');
    act(() => prompt().props.onChangeText('enhanced original'));
    act(() => button(tree, '生成设置').props.onPress());
    expect(tree.root.findAllByType(resultsType)).toHaveLength(1);
    expect(tree.root.findByType(require('./NovelAiSettings').NovelAiSettings).props.input.enhancement).toBeNull();
    act(() => button(tree, 'Medium').props.onPress());
    act(() => button(tree, '关闭生成设置').props.onPress());
    act(() => button(tree, '关闭增强').props.onPress());
    expect(prompt().props.value).toBe('my next scene');
    await act(async () => jest.advanceTimersByTime(650));
    expect(JSON.parse(mockDraft.input_json)).toMatchObject({effort:'medium',prompt:'my next scene',enhancement:null});
    expect(mockExecute.mock.calls.every(call=>call[0].name==='draft.updateImage')).toBe(true);
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(require('./novelAiRuntime').confirmCreativeImage).not.toHaveBeenCalled();
  } finally { act(() => tree?.unmount()); delete NativeModules.AutoDLMedia; }
});

test('generate saves the latest edits before preparing and ignores duplicate taps', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<ImageDraftScreen id="d" />); });
    act(() => tree.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === '图片提示词')!.props.onChangeText('An observatory'));
    const button = tree.root.findAll(n => n.props.accessibilityLabel === '生成 1 张图片' && typeof n.props.onPress === 'function')[0];
    await act(async () => { button.props.onPress(); button.props.onPress(); });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockDraft.input_json).prompt).toBe('An observatory');
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockExecute.mock.invocationCallOrder[0]).toBeLessThan(mockPrepare.mock.invocationCallOrder[0]);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(require('./novelAiRuntime').confirmCreativeImage).toHaveBeenCalledTimes(1);
  } finally { act(() => tree?.unmount()); }
});

test('Enhance panel edits scale, magnitude and advanced parameters before direct submission from the canvas', async()=>{
  mockDraft.input_json=JSON.stringify(createEnhanceInput({...defaultNovelAiDraft,prompt:'an observatory'},'source',832,1216));
  let tree!:ReturnType<typeof create>;
  try {
    await act(async()=>{tree=create(<ImageDraftScreen id="d" />);});
    expect(button(tree,'Max').props.accessibilityState.checked).toBe(true);
    expect(require('react-native').StyleSheet.flatten(tree.root.findByProps({testID:'image-processing-overlay'}).props.style).position).toBe('absolute');
    act(()=>button(tree,'1.5×').props.onPress());
    act(()=>button(tree,'5').props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('1280');
    act(()=>button(tree,'高级设置').props.onPress());
    const strength=tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='Strength（0.01–0.99）')!;
    act(()=>strength.props.onChangeText('0.35'));
    const noise=tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='Noise（0–0.99）')!;
    act(()=>noise.props.onChangeText('0.05'));
    expect(mockPrepare).not.toHaveBeenCalled();
    await act(async()=>button(tree,'增强图片').props.onPress());
    expect(mockPreparedInput).toMatchObject({enhancement:{scale:'1.5'},enhance:false,width:1280,height:1856,strength:0.35,noise:0.05,samples:1});
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(require('./novelAiRuntime').confirmCreativeImage).toHaveBeenCalledTimes(1);
  }finally{act(()=>tree?.unmount());}
});

test('failed save preserves input and prevents generation preparation', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<ImageDraftScreen id="d" />); });
    act(() => tree.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === '图片提示词')!.props.onChangeText('Keep my edits'));
    mockExecute.mockRejectedValueOnce(new Error('保存失败'));
    await act(async () => tree.root.findAll(n => n.props.accessibilityLabel === '生成 1 张图片' && typeof n.props.onPress === 'function')[0].props.onPress());
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === '图片提示词')!.props.value).toBe('Keep my edits');
  } finally { act(() => tree?.unmount()); }
});

test('an unknown submission stays on the canvas and blocks another generation', async () => {
  mockDraft = { ...mockDraft, state: 'SUBMITTED', job_id: 'unknown-job' };
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<ImageDraftScreen id="d" />); });
    act(() => tree.root.findByType(require('./CreativeResults').CreativeResults).props.onJobStatus('UNKNOWN'));
    expect(button(tree, '生成 1 张图片').props.disabled).toBe(true);
    expect(JSON.stringify(tree.toJSON())).toContain('请核查原任务');
    await act(async () => button(tree, '生成 1 张图片').props.onPress());
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockPrepare).not.toHaveBeenCalled();
  } finally { act(() => tree?.unmount()); }
});

test('a reviewed unknown image unlocks only a new explicit attempt and keeps its original result visible',async()=>{
  mockReviewed=true;
  mockDraft={...mockDraft,state:'SUBMITTED',job_id:'unknown-job',target_asset_id:'asset',input_json:JSON.stringify({...defaultNovelAiDraft,prompt:'A landscape'})};
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImageDraftScreen id="d"/>);});
    const results=()=>tree.root.findByType(require('./CreativeResults').CreativeResults);
    await act(async()=>results().props.onJobStatus('UNKNOWN'));
    expect(button(tree,'生成 1 张图片').props.disabled).toBe(false);
    expect(JSON.stringify(tree.toJSON())).not.toContain('请核查原任务');
    expect(mockPrepare).not.toHaveBeenCalled();
    await act(async()=>button(tree,'生成 1 张图片').props.onPress());
    expect(mockPrevious[0].job_id).toBe('unknown-job');
    expect(mockExecute.mock.calls.filter(([command])=>command.name==='draft.copySubmitted')).toHaveLength(1);
    expect(mockPrepare).toHaveBeenCalledTimes(1);
  }finally{act(()=>tree?.unmount());}
});

test('compact settings retain batch size and Medium and one click submits the batch once',async()=>{
  mockDraft.input_json=JSON.stringify({...defaultNovelAiDraft,prompt:'A landscape'});
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImageDraftScreen id="d" />);});
    act(()=>button(tree,'生成设置').props.onPress());
    act(()=>button(tree,'4').props.onPress());
    act(()=>button(tree,'Medium').props.onPress());

    const fields=tree.root.findAllByType(TextInput);
    expect(fields.find(n=>n.props.accessibilityLabel==='步数')?.props).toMatchObject({value:'14',editable:false});
    expect(button(tree,'Euler Ancestral').props.accessibilityState.disabled).toBe(true);
    act(()=>button(tree,'关闭生成设置').props.onPress());
    await act(async()=>button(tree,'生成 4 张图片').props.onPress());
    expect(JSON.parse(mockDraft.input_json)).toMatchObject({samples:4,effort:'medium',steps:23});
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(require('./novelAiRuntime').confirmCreativeImage).toHaveBeenCalledTimes(1);
  }finally{act(()=>tree?.unmount());}
});

test('background autosave keeps prompt editable and preserves typing that arrives during the save',async()=>{
  let tree!:ReturnType<typeof create>, release!:(value:unknown)=>void;
  try{
    await act(async()=>{tree=create(<ImageDraftScreen id="d" />);});
    const field=()=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='图片提示词')!;
    mockExecute.mockImplementationOnce(async command=>{await new Promise(resolve=>{release=resolve;});mockDraft={...mockDraft,input_json:JSON.stringify(command.payload.input),revision:1};return {status:'completed',value:{}};});
    act(()=>field().props.onChangeText('first'));
    await act(async()=>jest.advanceTimersByTime(650));
    expect(field().props.editable).toBe(true);
    act(()=>field().props.onChangeText('first and more'));
    await act(async()=>release(undefined));
    expect(field().props.value).toBe('first and more');
    await act(async()=>jest.advanceTimersByTime(650));
    expect(JSON.parse(mockDraft.input_json).prompt).toBe('first and more');
    expect(mockPrepare).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});

test('reference modes retain incomplete editing but refuse to prepare a request without a source',async()=>{
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImageDraftScreen id="d" />);});
    act(()=>button(tree,'展开画面编辑').props.onPress());
    act(()=>button(tree,'参考图').props.onPress());
    act(()=>button(tree,'局部重绘').props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('尚未选择底图');
    act(()=>button(tree,'关闭画面编辑').props.onPress());
    await act(async()=>jest.advanceTimersByTime(650));
    expect(JSON.parse(mockDraft.input_json).action).toBe('infill');
    expect(mockPrepare).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});

test('history uses the resized viewport without an editor overlay and switching back preserves the draft',async()=>{
 let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<ImageDraftScreen id="d"/>);});
  act(()=>button(tree,'生成历史').props.onPress());
  const results=()=>tree.root.findByType(require('./CreativeResults').CreativeResults);
  expect(results().props.historyVisible).toBe(true);
  const stage=()=>StyleSheet.flatten(tree.root.findByProps({testID:'image-workbench-canvas'}).props.style);
  expect(stage().flex).toBe(1);expect(stage().height).toBeUndefined();
  expect(tree.root.findAllByProps({testID:'image-workbench-tools'})).toHaveLength(0);
  act(()=>tree.root.findByProps({testID:'image-workbench-canvas'}).parent!.props.onLayout({nativeEvent:{layout:{width:351,height:220,x:0,y:0}}}));
  expect(stage().height).toBeUndefined();
  act(()=>button(tree,'展开画面编辑').props.onPress());
  expect(results().props.historyVisible).toBe(false);
  expect(StyleSheet.flatten(tree.root.findAllByProps({testID:'image-workbench-tools'})[0].props.style).position).toBe('absolute');
  act(()=>button(tree,'关闭画面编辑').props.onPress());
  expect(mockExecute).not.toHaveBeenCalled();
 }finally{act(()=>tree?.unmount());}
});

test('reuse exposes only a temporary toolbar undo and expires without reverting edits',async()=>{
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<ImageDraftScreen id="d"/>);});
  act(()=>tree.root.findByType(require('./CreativeResults').CreativeResults).props.onReuse({prompt:'new landscape'}));
  expect(button(tree,'撤销修改')).toBeDefined();
  expect(tree.root.findAllByType(require('react-native').Text).some(n=>n.props.children==='已应用提示词或参数')).toBe(false);
  await act(async()=>jest.advanceTimersByTime(10_000));
  expect(button(tree,'撤销修改')).toBeUndefined();
  expect(JSON.parse(mockDraft.input_json).prompt).toBe('new landscape');
 }finally{act(()=>tree?.unmount());}
});
