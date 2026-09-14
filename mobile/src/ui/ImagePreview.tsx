import { useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Image, Modal, PanResponder, Pressable, Text, View } from 'react-native';
import { COLORS } from './theme';
export function ImagePreview({ uri, onClose }: { uri: string | null; onClose(): void }) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const current = useRef(transform);
  const viewport = useRef({ width: 0, height: 0 });
  const start = useRef({ scale: 1, distance: 0, x: 0, y: 0, touchX: 0, touchY: 0, pinched: false });
  const closeRef = useRef<View>(null);
  const lastTap = useRef(0);
  const closeHandler = useRef(onClose); closeHandler.current = onClose;
  const distance = (touches: readonly { pageX: number; pageY: number }[]) => touches.length < 2 ? 0 : Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
  const update = (scale: number, x = 0, y = 0) => {
    scale = Math.max(1, Math.min(4, scale));
    if (scale < 1.01) scale = 1;
    const maxX = viewport.current.width * (scale - 1) / 2;
    const maxY = viewport.current.height * (scale - 1) / 2;
    const next = { scale, x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
    current.current = next; setTransform(next);
  };
  const close = () => { update(1); closeHandler.current(); };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => {
      const touches = event.nativeEvent.touches;
      start.current = { ...current.current, distance: distance(touches), touchX: touches[0]?.pageX ?? 0, touchY: touches[0]?.pageY ?? 0, pinched: touches.length > 1 };
    },
    onPanResponderMove: event => {
      const touches = event.nativeEvent.touches;
      const nextDistance = distance(touches);
      const anchor = start.current;
      if (nextDistance) {
        anchor.pinched = true;
        if (!anchor.distance) { anchor.distance = nextDistance; anchor.scale = current.current.scale; }
        update(anchor.scale * nextDistance / anchor.distance, current.current.x, current.current.y);
      } else if (touches[0]) {
        if (anchor.distance) {
          // A remaining finger starts a fresh pan at the current transform.
          anchor.distance = 0; anchor.x = current.current.x; anchor.y = current.current.y;
          anchor.touchX = touches[0].pageX; anchor.touchY = touches[0].pageY;
        }
        update(current.current.scale, anchor.x + touches[0].pageX - anchor.touchX, anchor.y + touches[0].pageY - anchor.touchY);
      }
    },
    onPanResponderRelease: (_event, gesture) => {
      if (start.current.pinched) { lastTap.current = 0; return; }
      if (current.current.scale === 1 && gesture.dy > 100 && Math.abs(gesture.dx) < 80) { close(); return; }
      if (Math.abs(gesture.dx) + Math.abs(gesture.dy) < 8) { const now = Date.now(); if (now - lastTap.current < 300) { update(current.current.scale > 1 ? 1 : 2); lastTap.current = 0; } else lastTap.current = now; }
    },
    onPanResponderTerminate: () => { lastTap.current = 0; },
  }), []);
  const { scale, x, y } = transform;
  return <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={close} onShow={() => { update(1); const target = findNodeHandle(closeRef.current); if (target) AccessibilityInfo.setAccessibilityFocus(target); }}><View style={{ flex: 1, backgroundColor: COLORS.mediaBackground }} accessibilityViewIsModal><View onLayout={event => { viewport.current = event.nativeEvent.layout; update(current.current.scale, current.current.x, current.current.y); }} style={{ flex: 1, overflow: 'hidden' }} {...pan.panHandlers}>{uri ? <Image testID="reference-image-preview" accessibilityLabel="图片预览，双指缩放，双击放大，向下滑动关闭" source={{ uri }} resizeMode="contain" style={{ width: '100%', height: '100%', transform: [{ translateX: x }, { translateY: y }, { scale }] }} /> : null}</View><View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 24 }}>{[['缩小', () => { update(current.current.scale - 0.5); }], ['放大', () => update(current.current.scale + 0.5)], ['关闭图片预览', close]].map(([label, action]) => <Pressable ref={label === '关闭图片预览' ? closeRef : undefined} key={String(label)} accessibilityRole="button" accessibilityLabel={String(label)} onPress={action as () => void} style={{ minHeight: 48, padding: 14 }}><Text style={{ color: COLORS.onPrimary }}>{String(label)}</Text></Pressable>)}</View></View></Modal>;
}
