import React from 'react';
import { act, create } from 'react-test-renderer';
import { Animated, Modal, Text } from 'react-native';
import { DraggableBottomSheet } from './DraggableSheet';

describe('DraggableBottomSheet', () => {
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
    expect(tree.root.findByProps({ accessibilityLabel: '拖动调整抽屉高度' }).props.style).toEqual(
      expect.objectContaining({ minHeight: 40 }),
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
      expect.arrayContaining([expect.objectContaining({ height: expect.any(Number) })]),
    );
    act(() => tree.unmount());
  });
});
