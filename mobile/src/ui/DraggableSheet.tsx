import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export type DraggableBottomSheetHandle = { expand: () => void };

export const DraggableBottomSheet = forwardRef<DraggableBottomSheetHandle, {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> (function DraggableBottomSheet({ visible, title, onClose, children, footer }, ref) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [layoutHeight, setLayoutHeight] = useState(height);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [snap, setSnap] = useState<Exclude<SheetSnap, 'closed'>>('collapsed');
  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      setSnap('expanded');
      if (Platform.OS !== 'android') return;
      const screenY = event.endCoordinates?.screenY;
      setKeyboardTop(typeof screenY === 'number' ? screenY : Math.max(0, height - (event.endCoordinates?.height ?? 0)));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardTop(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [height, visible]);
  // Modal windows may already resize for the IME. Use the visible bounds once,
  // rather than translating a full-height sheet (which clips scroll/footer areas).
  const availableHeight = Math.max(1, Math.min(layoutHeight, keyboardTop ?? layoutHeight));
  const collapsedOffset = availableHeight * 0.45;
  const expandedOffset = Math.max(insets.top + 8, availableHeight * 0.08);
  const closeOffset = availableHeight * 0.22;
  const position = useRef(new Animated.Value(collapsedOffset)).current;
  const dragStart = useRef(collapsedOffset);

  useEffect(() => {
    if (!visible) return;
    setSnap('collapsed');
    setKeyboardTop(null);
    position.setValue(layoutHeight);
  }, [position, visible]);

  useEffect(() => {
    if (!visible) return;
    const target = snap === 'expanded' ? expandedOffset : collapsedOffset;
    Animated.spring(position, {
      toValue: target,
      useNativeDriver: false,
      bounciness: 0,
      speed: 18,
    }).start();
  }, [collapsedOffset, expandedOffset, position, snap, visible]);

  const animateTo = (next: Exclude<SheetSnap, 'closed'>) => {
    const target = next === 'expanded' ? expandedOffset : collapsedOffset;
    setSnap(next);
    Animated.spring(position, { toValue: target, useNativeDriver: false, bounciness: 0, speed: 18 }).start();
  };
  useImperativeHandle(ref, () => ({ expand: () => setSnap('expanded') }), []);
  const close = () => { Keyboard.dismiss(); onClose(); };

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
      if (decision === 'closed') close();
      else animateTo(decision);
    },
    onPanResponderTerminate: () => animateTo(snap),
  }), [collapsedOffset, closeOffset, expandedOffset, onClose, position, snap]);

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalSurface}
      >
        <View style={styles.backdrop} onLayout={event => setLayoutHeight(event.nativeEvent.layout.height)}>
          <Pressable accessibilityLabel="关闭底部抽屉" style={StyleSheet.absoluteFill} onPress={close} />
          <Animated.View style={[styles.sheet, { top: position, bottom: Math.max(0, layoutHeight - availableHeight) }]}>
            <View style={[styles.surface, { paddingBottom: keyboardTop === null ? Math.max(12, insets.bottom) : 12 }]} accessibilityViewIsModal>
              <View accessibilityLabel="拖动调整抽屉高度" accessibilityRole="adjustable" accessibilityValue={{ text: snap === 'expanded' ? '全屏' : '半屏' }} accessibilityActions={[{ name: 'increment', label: '展开' }, { name: 'decrement', label: '收起' }]} onAccessibilityAction={event => animateTo(event.nativeEvent.actionName === 'increment' ? 'expanded' : 'collapsed')} style={styles.handleHitArea} {...panResponder.panHandlers}>
                <View style={styles.handle} />
              </View>
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <Pressable accessibilityLabel={`关闭${title}`} onPress={close} style={styles.closeButton}>
                  <Text style={styles.close}>×</Text>
                </Pressable>
              </View>
              <View style={styles.content}>{children}</View>
              {footer ? <View testID="bottom-sheet-footer" style={styles.footer}>{footer}</View> : null}
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalSurface: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,20,18,.3)' },
  sheet: { position: 'absolute', width: '100%' },
  surface: { flex: 1, paddingHorizontal: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FAF9F5', overflow: 'hidden' },
  handleHitArea: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#D9D7D0' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  title: { color: '#171715', fontSize: 20, fontWeight: '700' },
  close: { color: '#6E6D67', fontSize: 28, lineHeight: 28 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDDCD5', marginTop: 8 },
  content: { flex: 1, minHeight: 0 },
});
