jest.mock('./AudioVersionPreview',()=>({AudioVersionPreview:()=>null}));
import React from 'react';
import { act, create } from 'react-test-renderer';
import { CreativeWorkspace } from './CreativeWorkspace';
const mockExecute = jest.fn(async () => ({ status: 'completed', receiptId: 'r', value: {} }));
const mockService = { covers:jest.fn(async()=>[]),projects: jest.fn(async () => []), assets: jest.fn(async () => []), execute: mockExecute };
jest.mock('./runtime', () => ({ creativeService: () => mockService, importCreativeImage: jest.fn() }));
jest.mock('../native/imagePicker', () => ({ pickImagesFromGallery: jest.fn(async () => []) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]) }));

test('project creation uses the shared command and prevents simultaneous duplicate taps', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeWorkspace mode="projects" />); });
    act(() => { tree.root.findByProps({ accessibilityLabel: '项目名称' }).props.onChangeText('Observatory'); tree.root.findByProps({ accessibilityLabel: '创作简报' }).props.onChangeText('A short film'); });
    const button = tree.root.findAll(n => n.props.accessibilityLabel === '创建项目' && typeof n.props.onPress === 'function')[0];
    await act(async () => { button.props.onPress(); button.props.onPress(); });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith({ name: 'project.create', payload: { title: 'Observatory', brief: 'A short film' } }, expect.any(String));
    expect(tree.root.findByProps({ accessibilityLabel: '项目名称' }).props.value).toBe('');
  } finally { act(() => tree?.unmount()); }
});
