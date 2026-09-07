import React from 'react';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, Animated, Keyboard, KeyboardAvoidingView, Modal, Text } from 'react-native';
import { DraggableBottomSheet } from './DraggableSheet';
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));

describe('DraggableBottomSheet', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(new Promise(() => undefined)); });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });
  it('renders an accessible handle with a full touch target and sheet content', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <DraggableBottomSheet visible title="引用图片附件" onClose={() => undefined}>
          <Text>内容</Text>
        </DraggableBottomSheet>,
      );
    });
    expect(tree.root.findByType(Modal).props.visible).toBe(true);
    expect(tree.root.findByType(KeyboardAvoidingView).props.behavior).toBe('padding');
    expect(tree.root.findByProps({ accessibilityLabel: '拖动调整抽屉高度' }).props.style).toEqual(
      expect.objectContaining({ minHeight: 48 }),
    );
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === '内容')).toBe(true);
    act(() => tree.unmount());
  });

  it('exposes handle pan handlers and uses the expanded near-full-screen offset', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <DraggableBottomSheet visible title="历史" onClose={() => undefined}>
          <Text>内容</Text>
        </DraggableBottomSheet>,
      );
    });
    const handle = tree.root.findByProps({ accessibilityLabel: '拖动调整抽屉高度' });
    expect(typeof handle.props.onResponderGrant).toBe('function');
    expect(typeof handle.props.onResponderRelease).toBe('function');
    expect(tree.root.findByType(Animated.View).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ top: expect.any(Object), bottom: expect.any(Number) })]),
    );
    act(() => tree.unmount());
  });

  it('expands for keyboard input and exposes both snap stops to accessibility', () => {
    const callbacks = new Map<string, (event: any) => void>();
    const listener = jest.spyOn(Keyboard, 'addListener').mockImplementation((name, callback) => {
      callbacks.set(name, callback); return { remove: jest.fn() };
    });
    const close = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<DraggableBottomSheet visible title="编辑" onClose={close} footer={<Text>保存</Text>}><Text>正文</Text></DraggableBottomSheet>); });
    const handle = () => tree.root.findByProps({ accessibilityLabel: '拖动调整抽屉高度' });
    expect(handle().props.accessibilityValue.text).toBe('半屏');
    act(() => tree.root.findByProps({ testID: 'bottom-sheet-surface' }).props.onFocus());
    act(() => (callbacks.get('keyboardWillShow') ?? callbacks.get('keyboardDidShow'))!({ endCoordinates: { screenY: 400, height: 300 } }));
    expect(handle().props.accessibilityValue.text).toBe('全屏');
    act(() => handle().props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    expect(handle().props.accessibilityValue.text).toBe('半屏');
    expect(tree.root.findByProps({ testID: 'bottom-sheet-footer' }).findByType(Text).props.children).toBe('保存');
    act(() => tree.unmount()); listener.mockRestore();
  });

  it('ignores another surface keyboard and restores its prior snap after its own keyboard hides', () => {
    const callbacks = new Map<string, (event: any) => void>();
    jest.spyOn(Keyboard, 'addListener').mockImplementation((name, callback) => { callbacks.set(name, callback); return { remove: jest.fn() }; });
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<DraggableBottomSheet visible title="编辑" onClose={() => undefined}><Text>输入</Text></DraggableBottomSheet>); });
    const handle = () => tree.root.findByProps({ accessibilityLabel: '拖动调整抽屉高度' });
    const show = () => (callbacks.get('keyboardWillShow') ?? callbacks.get('keyboardDidShow'))!({ endCoordinates: { screenY: 400, height: 300 } });
    act(show);
    expect(handle().props.accessibilityValue.text).toBe('半屏');
    act(() => tree.root.findByProps({ testID: 'bottom-sheet-surface' }).props.onFocus());
    act(show);
    expect(handle().props.accessibilityValue.text).toBe('全屏');
    act(() => callbacks.get('keyboardDidHide')!({}));
    expect(handle().props.accessibilityValue.text).toBe('半屏');
    act(() => tree.unmount());
  });

  it('honors reduced motion for both modal and snap transitions', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    const spring = jest.spyOn(Animated, 'spring');
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<DraggableBottomSheet visible title="历史" onClose={() => undefined}><Text>内容</Text></DraggableBottomSheet>); });
    expect(tree.root.findByType(Modal).props.animationType).toBe('none');
    spring.mockClear();
    act(() => tree.root.findByProps({ accessibilityLabel: '拖动调整抽屉高度' }).props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    expect(spring).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

});
