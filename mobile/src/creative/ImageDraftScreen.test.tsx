import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, TextInput } from 'react-native';
import { ImageDraftScreen } from './ImageDraftScreen';
import { defaultNovelAiDraft } from './novelAiProtocol';
import { createEnhanceInput } from './novelAiEnhancement';

let mockDraft: any;
const mockExecute = jest.fn(async (command: any) => { mockDraft = { ...mockDraft, input_json: JSON.stringify(command.payload.input), revision: mockDraft.revision + 1 }; return { status: 'completed', value: {} }; });
const mockPrepare = jest.fn(async (_id: string) => ({ account: { credential_generation_id: 'test-account' }, prepared: { inputSnapshot: { seed: 1 } } }));
jest.mock('./runtime', () => ({ creativeService: () => ({ draft: async () => mockDraft, draftInputs: async () => [], execute: mockExecute }) }));
jest.mock('./novelAiRuntime', () => ({ prepareCreativeImage: (id: string) => mockPrepare(id), confirmCreativeImage: jest.fn() }));
jest.mock('./CreativeResults', () => ({ CreativeResults: () => null }));
jest.mock('./CreativeAccountPanel', () => ({ CreativeAccountPanel: () => null }));
jest.mock('./DraftHeading', () => ({ DraftHeading: () => null }));
jest.mock('./CopySubmittedDraft', () => ({ CopySubmittedDraft: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({}), usePreventRemove: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  mockDraft = { id: 'd', provider_id: 'novelai', state: 'EDITING', revision: 0, input_json: JSON.stringify(defaultNovelAiDraft) };
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

const button=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label && typeof n.props.onPress==='function')[0];

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
    expect(Alert.alert).toHaveBeenCalledWith('确认生成 1 张图片', expect.any(String), expect.any(Array), expect.any(Object));
  } finally { act(() => tree?.unmount()); }
});

test('Enhance panel edits scale, magnitude and advanced parameters before one explicit enhancement confirmation', async()=>{
  mockDraft.input_json=JSON.stringify(createEnhanceInput({...defaultNovelAiDraft,prompt:'an observatory'},'source',832,1216));
  let tree!:ReturnType<typeof create>;
  try {
    await act(async()=>{tree=create(<ImageDraftScreen id="d" />);});
    expect(button(tree,'Max').props.accessibilityState.checked).toBe(true);
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
    expect(JSON.parse(mockDraft.input_json)).toMatchObject({enhancement:{scale:'1.5'},enhance:false,width:1280,height:1856,strength:0.35,noise:0.05,samples:1});
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith('确认增强图片',expect.stringContaining('倍率 1.5，强度 0.35，噪声 0.05'),expect.any(Array),expect.any(Object));
    expect(require('./novelAiRuntime').confirmCreativeImage).not.toHaveBeenCalled();
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

test('settings persist batch size and Medium and generation confirmation authorizes the whole batch once',async()=>{
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImageDraftScreen id="d" />);});
    act(()=>button(tree,'生成设置').props.onPress());
    act(()=>button(tree,'4 张').props.onPress());
    act(()=>button(tree,'Medium · 更快速').props.onPress());
    expect(tree.root.findAllByProps({accessibilityLabel:'步数'})).toHaveLength(0);
    act(()=>button(tree,'专业参数').props.onPress());
    const fields=tree.root.findAllByType(TextInput);
    expect(fields.find(n=>n.props.accessibilityLabel==='步数')?.props).toMatchObject({value:'14',editable:false});
    expect(button(tree,'Euler Ancestral').props.accessibilityState.disabled).toBe(true);
    act(()=>button(tree,'完成').props.onPress());
    await act(async()=>button(tree,'生成 4 张图片').props.onPress());
    expect(JSON.parse(mockDraft.input_json)).toMatchObject({samples:4,effort:'medium',steps:23});
    expect(Alert.alert).toHaveBeenCalledWith('确认生成 4 张图片',expect.stringContaining('1 次请求（含 4 张图片）'),expect.any(Array),expect.any(Object));
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
    act(()=>button(tree,'底图').props.onPress());
    act(()=>button(tree,'局部重绘').props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('尚未选择底图');
    act(()=>button(tree,'完成').props.onPress());
    await act(async()=>jest.advanceTimersByTime(650));
    expect(JSON.parse(mockDraft.input_json).action).toBe('infill');
    expect(mockPrepare).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});
