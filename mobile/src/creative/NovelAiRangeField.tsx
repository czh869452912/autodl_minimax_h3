import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { NovelAiNumberField } from './NovelAiNumberField';
import { COLORS } from '../ui/theme';

export function NovelAiRangeField({ label, value, min, max, editable, onChange }: { label: string; value: number; min: number; max: number; editable: boolean; onChange: (value: number) => void }) {
  const [width, setWidth] = useState(0), start = useRef(0);
  const clamp = (n: number) => Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
  const position = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const fromTouch = (event: GestureResponderEvent) => { if (editable && width > 0) onChange(clamp(min + (event.nativeEvent.pageX - start.current) / width * (max - min))); };
  return <View style={{ flex: 1, minWidth: 120, gap: 2 }}>
    <NovelAiNumberField label={`${label}（${min}–${max}）`} value={value} editable={editable} onChange={n => { if (n !== null) onChange(n); }} />
    <View accessibilityRole="adjustable" accessibilityLabel={`${label} 滑块`} accessibilityState={{ disabled: !editable }}
      accessibilityValue={{ min, max, now: value }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => { if (editable) onChange(clamp(value + (event.nativeEvent.actionName === 'increment' ? 0.01 : -0.01))); }}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => editable} onMoveShouldSetResponder={() => editable}
      onResponderGrant={event => { start.current = event.nativeEvent.pageX - event.nativeEvent.locationX; fromTouch(event); }}
      onResponderMove={fromTouch} style={{ height: 44, justifyContent: 'center', opacity: editable ? 1 : 0.45 }}>
      <View pointerEvents="none" style={{ height: 6, backgroundColor: COLORS.border, borderRadius: 3 }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.primary, width: `${position * 100}%` }} />
        <View style={{ position: 'absolute', top: -8, left: `${position * 100}%`, marginLeft: -10, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.surface }} />
      </View>
    </View>
  </View>;
}
