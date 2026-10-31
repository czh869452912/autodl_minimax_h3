import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { NovelAiNumberField } from './NovelAiNumberField';
import { COLORS } from '../ui/theme';

export function NovelAiRangeField({ label, value, min, max, editable, onChange, step=0.01, horizontal=false }: { label: string; value: number; min: number; max: number; editable: boolean; onChange: (value: number) => void; step?:number; horizontal?:boolean }) {
  const [dragValue,setDragValue]=useState<number>();
  const [width, setWidth] = useState(0), start = useRef(0),touch=useRef({x:0,y:0}),vertical=useRef(false),pending=useRef<number|undefined>(undefined);
  const clamp = (n: number) => Number((Math.round(Math.min(max, Math.max(min, n))/step)*step).toFixed(4));
  const position = Math.min(1, Math.max(0, ((dragValue??value) - min) / (max - min)));
  const fromTouch = (event: GestureResponderEvent) => { if (editable && width > 0) onChange(clamp(min + (event.nativeEvent.pageX - start.current) / width * (max - min))); };
  return <View style={{ flex:horizontal?undefined:1, minWidth: 120, gap: 8,flexDirection:horizontal?'row':'column',alignItems:horizontal?'center':undefined }}>
    <View style={horizontal?{width:84}:undefined}><NovelAiNumberField containerStyle={{flexGrow:0,flexBasis:'auto'}} label={horizontal?label:`${label}（${min}–${max}）`} value={dragValue??value} editable={editable} onChange={n => { if (n !== null) onChange(clamp(n)); }} /></View>
    <View accessibilityRole="adjustable" accessibilityLabel={`${label} 滑块`} accessibilityState={{ disabled: !editable }}
      accessibilityValue={{ min, max, now: dragValue??value }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => { if (editable) onChange(clamp(value + (event.nativeEvent.actionName === 'increment' ? step : -step))); }}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => editable} onMoveShouldSetResponder={() => editable}
      onResponderGrant={event => { start.current = event.nativeEvent.pageX - event.nativeEvent.locationX; touch.current={x:event.nativeEvent.pageX,y:event.nativeEvent.pageY};vertical.current=false;pending.current=undefined; }}
      onResponderMove={event=>{const dx=Math.abs(event.nativeEvent.pageX-touch.current.x),dy=Math.abs(event.nativeEvent.pageY-touch.current.y);if(dy>8&&dy>dx){vertical.current=true;setDragValue(undefined);}if(!vertical.current&&dx>5&&width>0){pending.current=clamp(min+(event.nativeEvent.pageX-start.current)/width*(max-min));setDragValue(pending.current);}}}
      onResponderRelease={event=>{setDragValue(undefined);if(!vertical.current){if(pending.current!==undefined)onChange(pending.current);else fromTouch(event);}}}
      onResponderTerminate={()=>setDragValue(undefined)} onResponderTerminationRequest={()=>true} style={{ flex:horizontal?1:undefined,height: 44, justifyContent: 'center', opacity: editable ? 1 : 0.45 }}>
      <View pointerEvents="none" style={{ height: 6, backgroundColor: COLORS.border, borderRadius: 3 }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.primary, width: `${position * 100}%` }} />
        <View style={{ position: 'absolute', top: -8, left: `${position * 100}%`, marginLeft: -10, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.surface }} />
      </View>
    </View>
  </View>;
}
