import { useRef, useState } from 'react';
import { Image, PanResponder, Text, View } from 'react-native';
import type { NovelAiDraftInput } from './novelAiProtocol';
import { SegmentedChoices, TextAction } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';

type Stroke = NovelAiDraftInput['maskStrokes'][number];
/** Coordinates and brush radius use the exact output canvas, including its aspect ratio. */
export function NovelAiMaskEditor({ uri, input, onChange, disabled }: { uri: string; input: NovelAiDraftInput; onChange: (strokes: Stroke[]) => void; disabled: boolean }) {
  const [size, setSize] = useState({ width: 1, height: 1 }), [radius, setRadius] = useState('0.04');
  const [drawing, setDrawing] = useState<Stroke>();
  const active = useRef<Stroke | undefined>(undefined);
  const current = useRef({ input, disabled, size, radius, onChange }); current.current = { input, disabled, size, radius, onChange };
  const point = (x: number, y: number) => ({ x: Math.max(0, Math.min(1, x / current.current.size.width)), y: Math.max(0, Math.min(1, y / current.current.size.height)) });
  const finish = () => { const stroke = active.current; active.current = undefined; setDrawing(undefined); if (stroke) current.current.onChange([...current.current.input.maskStrokes, stroke]); };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !current.current.disabled && current.current.input.maskStrokes.length < 100 && current.current.input.maskStrokes.reduce((n, stroke) => n + stroke.points.length, 0) < 2048,
    onMoveShouldSetPanResponder: () => Boolean(active.current),
    onPanResponderGrant: e => { active.current = { radius: Number(current.current.radius), points: [point(e.nativeEvent.locationX, e.nativeEvent.locationY)] }; setDrawing(active.current); },
    onPanResponderMove: e => { if (active.current && active.current.points.length < 2048) { const p = point(e.nativeEvent.locationX, e.nativeEvent.locationY), last = active.current.points.at(-1)!; if (Math.hypot(p.x-last.x,p.y-last.y) > 0.002) { active.current = { ...active.current, points: [...active.current.points, p] }; setDrawing(active.current); } } },
    onPanResponderRelease: finish, onPanResponderTerminate: finish, onPanResponderTerminationRequest: () => false,
  })).current;
  const strokes = [...input.maskStrokes, ...(drawing ? [drawing] : [])];
  return <View style={{ gap: 12 }}>
    <Text style={s.muted}>涂亮需要重绘的区域，未涂区域保留。底图按输出比例铺满。</Text>
    <View accessibilityLabel="重绘蒙版画布" onLayout={e => setSize(e.nativeEvent.layout)} {...responder.panHandlers} style={{ width: '100%', aspectRatio: input.width / input.height, backgroundColor: '#18202b', overflow: 'hidden', borderRadius: 12 }}>
      <Image source={{ uri }} resizeMode="stretch" style={{ width: '100%', height: '100%' }} />
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>{strokes.flatMap((stroke, index) => {
        const diameter = stroke.radius * Math.min(size.width, size.height) * 2;
        return stroke.points.map((p, i) => { const previous = stroke.points[Math.max(0, i-1)], dx=(p.x-previous.x)*size.width, dy=(p.y-previous.y)*size.height, length=Math.hypot(dx,dy); return <View key={`${index}:${i}`} style={{ position: 'absolute', left: (p.x+previous.x)/2*size.width-(length+diameter)/2, top: (p.y+previous.y)/2*size.height-diameter/2, width: length+diameter, height: diameter, borderRadius: diameter/2, backgroundColor: 'rgba(255,226,120,0.7)', transform: [{rotate:`${Math.atan2(dy,dx)}rad`}] }} />; });
      })}</View>
    </View>
    <SegmentedChoices label="蒙版画笔大小" value={radius} options={[{id:'0.02',label:'细笔'},{id:'0.04',label:'中笔'},{id:'0.08',label:'粗笔'}]} onChange={setRadius} disabled={disabled} />
    <View style={s.row}><TextAction label="撤销一笔" disabled={disabled || !input.maskStrokes.length} onPress={() => onChange(input.maskStrokes.slice(0,-1))} /><TextAction label="清空蒙版" disabled={disabled || !input.maskStrokes.length} onPress={() => onChange([])} /></View>
  </View>;
}
