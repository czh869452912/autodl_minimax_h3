import { useState } from 'react';
import { Text, View } from 'react-native';
import type { NovelAiDraftInput } from './novelAiProtocol';
import { ENHANCE_MAGNITUDES, enhanceOutputSize, enhanceScales, enhancementPatch } from './novelAiEnhancement';
import { SectionHeading, SegmentedChoices, TextAction } from './WorkbenchUI';
import { NovelAiRangeField } from './NovelAiRangeField';
import { creativeUI as s } from './creativeUI';
import { COLORS } from '../ui/theme';

export function NovelAiEnhancePanel({ input, update, editable }: { input: NovelAiDraftInput; update: (patch: Partial<NovelAiDraftInput>) => void; editable: boolean }) {
  const [advanced, setAdvanced] = useState(false);
  const e = input.enhancement;
  if (!e) return null;
  const size = enhanceOutputSize(e), magnitude = ENHANCE_MAGNITUDES.findIndex(m => m.strength === input.strength && m.noise === input.noise);
  return <View style={[s.card, { gap: 10, borderColor: COLORS.primary }]}>
    <SectionHeading title="增强画质 · Enhance" detail="单张输出" />
    <Text style={s.muted}>放大比例</Text>
    <SegmentedChoices singleRow label="Enhance 放大比例" value={e.scale} disabled={!editable}
      options={enhanceScales(e.sourceWidth, e.sourceHeight, input.model).map(id => ({ id, label: id === 'max' ? 'Max' : `${id}×` }))}
      onChange={scale => update(enhancementPatch({ ...e, scale }))} />
    <Text style={s.muted}>{e.sourceWidth} × {e.sourceHeight} → {e.scale === 'max' ? '预计 ' : ''}{size.width} × {size.height}</Text>
    {advanced ? <View style={s.row}>
      <NovelAiRangeField label="Strength" min={0.01} max={0.99} value={input.strength} editable={editable} onChange={strength => update({ strength })} />
      <NovelAiRangeField label="Noise" min={0} max={0.99} value={input.noise} editable={editable} onChange={noise => update({ noise })} />
    </View> : <><SectionHeading title="变化幅度" detail={magnitude < 0 ? '自定义' : `${magnitude + 1} / 5`} />
      <SegmentedChoices singleRow label="Enhance 变化幅度" value={String(magnitude + 1)} disabled={!editable}
        options={ENHANCE_MAGNITUDES.map((_, index) => ({ id: String(index + 1), label: String(index + 1) }))}
        onChange={value => update(ENHANCE_MAGNITUDES[Number(value) - 1])} />
    </>}
    <View style={s.row}><Text style={s.muted}>强度 {input.strength} · 噪声 {input.noise}</Text><TextAction label={advanced ? '收起高级设置' : '高级设置'} onPress={() => setAdvanced(!advanced)} /></View>
    <Text style={s.muted}>强度越高，画面变化越明显。增强会生成新版本，保留原图。</Text>
  </View>;
}
