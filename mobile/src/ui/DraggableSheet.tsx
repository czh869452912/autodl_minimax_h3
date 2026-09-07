import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Animated,
  AccessibilityInfo,
  findNodeHandle,
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
import { COLORS } from './theme';
import { AppIcon } from './icons';

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
  const snapBeforeKeyboard = useRef(snap);
  const keyboardVisible = useRef(false);
  const ownsFocus = useRef(false);
  const [hasInputFocus, setInputFocus] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const headingRef = useRef<Text>(null);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      if (!ownsFocus.current) return;
      if (!keyboardVisible.current) snapBeforeKeyboard.current = snap;
      keyboardVisible.current = true;
      setSnap('expanded');
      if (Platform.OS !== 'android') return;
      const screenY = event.endCoordinates?.screenY;
      setKeyboardTop(typeof screenY === 'number' ? screenY : Math.max(0, height - (event.endCoordinates?.height ?? 0)));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { setKeyboardTop(null); if (keyboardVisible.current) setSnap(snapBeforeKeyboard.current); keyboardVisible.current = false; });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [height, visible, snap]);
  // Modal windows may already resize for the IME. Use the visible bounds once,
  // rather than translating a full-height sheet (which clips scroll/footer areas).
  const availableHeight = Math.max(1, Math.min(layoutHeight, keyboardTop ?? layoutHeight));
  const collapsedOffset = availableHeight * 0.45;
  const expandedOffset = Math.max(insets.top + 8, availableHeight * 0.08);
  const closeOffset = availableHeight * 0.22;
  const position = useRef(new Animated.Value(collapsedOffset)).current;
  const dragStart = useRef(collapsedOffset);

  useEffect(() => {
    keyboardVisible.current = false;
    ownsFocus.current = false;
    setInputFocus(false);
    if (!visible) { position.stopAnimation(); return; }
    setSnap('collapsed');
    setKeyboardTop(null);
    position.setValue(layoutHeight);
    return () => position.stopAnimation();
  }, [position, visible]);

  useEffect(() => {
    if (!visible) return;
    const target = snap === 'expanded' ? expandedOffset : collapsedOffset;
    if (reduceMotion) { position.setValue(target); return; }
    Animated.spring(position, {
      toValue: target,
      useNativeDriver: false,
      bounciness: 0,
      speed: 18,
    }).start();
  }, [collapsedOffset, expandedOffset, position, reduceMotion, snap, visible]);

  const animateTo = (next: Exclude<SheetSnap, 'closed'>) => {
    const target = next === 'expanded' ? expandedOffset : collapsedOffset;
    setSnap(next);
    if (reduceMotion) { position.setValue(target); return; }
    Animated.spring(position, { toValue: target, useNativeDriver: false, bounciness: 0, speed: 18 }).start();
  };
  useImperativeHandle(ref, () => ({ expand: () => setSnap('expanded') }), []);
  const close = () => { if (ownsFocus.current || keyboardVisible.current) Keyboard.dismiss(); onClose(); };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      dragStart.current = snap === 'expanded' ? expandedOffset : collapsedOffset;
      position.stopAnimation(value => { dragStart.current = value; });
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
  }), [collapsedOffset, closeOffset, expandedOffset, onClose, position, reduceMotion, snap]);

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={close} onShow={() => { const target = findNodeHandle(headingRef.current); if (target) AccessibilityInfo.setAccessibilityFocus(target); }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={hasInputFocus}
        style={styles.modalSurface}
      >
        <View style={styles.backdrop} onLayout={event => setLayoutHeight(event.nativeEvent.layout.height)}>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭底部抽屉" style={StyleSheet.absoluteFill} onPress={close} />
          <Animated.View style={[styles.sheet, { top: position, bottom: Math.max(0, layoutHeight - availableHeight) }]}>
            <View testID="bottom-sheet-surface" onFocus={() => { ownsFocus.current = true; setInputFocus(true); }} onBlur={() => { ownsFocus.current = false; setInputFocus(false); }} onAccessibilityEscape={close} style={[styles.surface, { paddingBottom: keyboardTop === null ? Math.max(12, insets.bottom) : 12 }]} accessibilityViewIsModal>
              <View accessibilityLabel="拖动调整抽屉高度" accessibilityRole="adjustable" accessibilityValue={{ text: snap === 'expanded' ? '全屏' : '半屏' }} accessibilityActions={[{ name: 'increment', label: '展开' }, { name: 'decrement', label: '收起' }]} onAccessibilityAction={event => animateTo(event.nativeEvent.actionName === 'increment' ? 'expanded' : 'collapsed')} style={styles.handleHitArea} {...panResponder.panHandlers}>
                <View style={styles.handle} />
              </View>
              <View style={styles.header}>
                <Text ref={headingRef} accessibilityRole="header" style={styles.title}>{title}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`关闭${title}`} onPress={close} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                  <AppIcon name="close" size={24} color={COLORS.textMuted} />
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
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.scrim },
  sheet: { position: 'absolute', width: '100%' },
  surface: { flex: 1, paddingHorizontal: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: COLORS.background, overflow: 'hidden' },
  handleHitArea: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: COLORS.textSubtle },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  title: { flex: 1, flexShrink: 1, color: COLORS.text, fontSize: 20, fontWeight: '700' },
  pressed: { backgroundColor: COLORS.surfaceRaised },
  closeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, marginTop: 8 },
  content: { flex: 1, minHeight: 0 },
});
