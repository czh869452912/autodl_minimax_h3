import React from 'react';
import { act, create } from 'react-test-renderer';
import { VideoDraftScreen } from './VideoDraftScreen';
import { RESOLUTION_OPTIONS } from '../create/resolutions';
const mockPick = jest.fn();
const mockExecute = jest.fn();
const mockImport = jest.fn();
const mockDraft = { id: 'd', state: 'EDITING', revision: 1, project_id: null, input_json: JSON.stringify({ schemaVersion: 1, prompt: '', resolution: RESOLUTION_OPTIONS[0], duration: 5, seed: '' }) };
jest.mock('./runtime', () => ({ creativeService: () => ({ draft: async () => mockDraft, draftInputs: async () => [], execute: mockExecute }), importCreativeImage: (...args: any[]) => mockImport(...args), creativeFiles: () => ({ verify: jest.fn() }) }));
jest.mock('../native/imagePicker', () => ({ pickImagesFromGallery: () => mockPick() }));
jest.mock('./videoRuntime', () => ({ prepareCreativeVideo: jest.fn(), confirmCreativeVideo: jest.fn() }));
jest.mock('./CreativeResults', () => ({ CreativeResults: () => null }));
jest.mock('./CreativeAccountPanel', () => ({ CreativeAccountPanel: () => null }));
jest.mock('./DraftHeading', () => ({ DraftHeading: () => null }));
jest.mock('./CopySubmittedDraft', () => ({ CopySubmittedDraft: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({}), usePreventRemove: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));

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
