import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, TextInput } from 'react-native';
import { ImageDraftScreen } from './ImageDraftScreen';
import { defaultNovelAiDraft } from './novelAiProtocol';

let mockDraft: any;
const mockExecute = jest.fn(async (command: any) => { mockDraft = { ...mockDraft, input_json: JSON.stringify(command.payload.input), revision: mockDraft.revision + 1 }; return { status: 'completed', value: {} }; });
const mockPrepare = jest.fn(async (_id: string) => ({ account: { credential_generation_id: 'test-account' }, prepared: { inputSnapshot: { seed: 1 } } }));
jest.mock('./runtime', () => ({ creativeService: () => ({ draft: async () => mockDraft, execute: mockExecute }) }));
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

test('generate saves the latest edits before preparing and ignores duplicate taps', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<ImageDraftScreen id="d" />); });
    act(() => tree.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === '图片提示词')!.props.onChangeText('An observatory'));
    const button = tree.root.findAll(n => n.props.accessibilityLabel === '生成 1 张 · 费用待确认' && typeof n.props.onPress === 'function')[0];
    await act(async () => { button.props.onPress(); button.props.onPress(); });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockDraft.input_json).prompt).toBe('An observatory');
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockExecute.mock.invocationCallOrder[0]).toBeLessThan(mockPrepare.mock.invocationCallOrder[0]);
    expect(Alert.alert).toHaveBeenCalledWith('确认生成 1 张图片', expect.any(String), expect.any(Array), expect.any(Object));
  } finally { act(() => tree?.unmount()); }
});

test('failed save preserves input and prevents generation preparation', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<ImageDraftScreen id="d" />); });
    act(() => tree.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === '图片提示词')!.props.onChangeText('Keep my edits'));
    mockExecute.mockRejectedValueOnce(new Error('保存失败'));
    await act(async () => tree.root.findAll(n => n.props.accessibilityLabel === '生成 1 张 · 费用待确认' && typeof n.props.onPress === 'function')[0].props.onPress());
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === '图片提示词')!.props.value).toBe('Keep my edits');
  } finally { act(() => tree?.unmount()); }
});
