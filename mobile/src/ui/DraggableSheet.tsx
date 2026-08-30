import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { resolveBottomSheetRelease, type SheetSnap } from './draggableBottomSheet';

export function DraggableBottomSheet({ visible, title, onClose, children }: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { height } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      const screenY = event.endCoordinates?.screenY;
      const nextHeight = typeof screenY === 'number'
        ? Math.max(0, height - screenY)
        : event.endCoordinates?.height ?? 0;
      setKeyboardHeight(nextHeight);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [height]);
  const availableHeight = Math.max(1, height - keyboardHeight);
  const collapsedOffset = availableHeight * 0.55;
  const expandedOffset = availableHeight * 0.08;
  const closeOffset = availableHeight * 0.22;
  const [snap, setSnap] = useState<Exclude<SheetSnap, 'closed'>>('collapsed');
  const position = useRef(new Animated.Value(collapsedOffset)).current;
  const dragStart = useRef(collapsedOffset);

  useEffect(() => {
    if (!visible) return;
    setSnap('collapsed');
    position.setValue(collapsedOffset);
  }, [position, visible]);

  useEffect(() => {
    if (!visible) return;
    const target = snap === 'expanded' ? expandedOffset : collapsedOffset;
    Animated.spring(position, {
      toValue: target,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  }, [collapsedOffset, expandedOffset, position, snap, visible]);

  const animateTo = (next: Exclude<SheetSnap, 'closed'>) => {
    const target = next === 'expanded' ? expandedOffset : collapsedOffset;
    setSnap(next);
    Animated.spring(position, { toValue: target, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      dragStart.current = snap === 'expanded' ? expandedOffset : collapsedOffset;
      position.stopAnimation();
    },
    onPanResponderMove: (_, gesture) => {
      position.setValue(Math.max(0, Math.min(collapsedOffset + closeOffset, dragStart.current + gesture.dy)));
    },
    onPanResponderRelease: (_, gesture) => {
      const decision = resolveBottomSheetRelease({
        current: snap,
        translationY: gesture.dy,
        velocityY: gesture.vy * 1000,
        collapsedOffset,
        expandedOffset,
        closeOffset,
      });
      if (decision === 'closed') onClose();
      else animateTo(decision);
    },
    onPanResponderTerminate: () => animateTo(snap),
  }), [collapsedOffset, closeOffset, expandedOffset, onClose, position, snap]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalSurface}
      >
        <View style={styles.backdrop}>
          <Pressable accessibilityLabel="关闭底部抽屉" style={StyleSheet.absoluteFill} onPress={onClose} />
          <Animated.View style={[styles.sheet, { height, transform: [{ translateY: position }] }]}>
            <View style={styles.surface}>
              <View accessibilityLabel="拖动调整抽屉高度" style={styles.handleHitArea} {...panResponder.panHandlers}>
                <View style={styles.handle} />
              </View>
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <Pressable accessibilityLabel="关闭底部抽屉" onPress={onClose}>
                  <Text style={styles.close}>×</Text>
                </Pressable>
              </View>
              <View style={styles.content}>{children}</View>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalSurface: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,20,18,.3)' },
  sheet: { width: '100%' },
  surface: { flex: 1, padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FAF9F5' },
  handleHitArea: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#D9D7D0' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  title: { color: '#171715', fontSize: 20, fontWeight: '700' },
  close: { color: '#6E6D67', fontSize: 28, lineHeight: 28 },
  content: { flex: 1, minHeight: 0 },
});
