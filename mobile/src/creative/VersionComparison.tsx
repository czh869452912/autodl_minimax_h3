import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { AssetVersion } from './types';
import { compareRecipeFields } from './recipeDiff';
import { COLORS } from '../ui/theme';
import { TextVersionPreview } from './TextVersionPreview';
import { MediaPreview } from './MediaPreview';
import { SectionHeading, SegmentedChoices, SettingRow } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';

const recipe = (v: AssetVersion) => v.recipe.input ?? v.recipe.inputSnapshot ?? { prompt: v.recipe.prompt ?? null, jobId: v.recipe.jobId ?? null };
const recipeText = (v: AssetVersion) => JSON.stringify(recipe(v), null, 2);
const labels: Record<string, string> = { prompt: '画面描述', negative: '排除内容', seed: '随机种子', model: '模型', width: '宽度', height: '高度', resolution: '画质与方向', duration: '时长', steps: '步数', guidance: '引导强度', characters: '角色', sampler: '采样器', noiseSchedule: '噪声设置', rescale: '引导重缩放' };
function differenceLabel(path: string) {
  return labels[path.split('/')[1]] ?? '其他参数';
}

export function VersionComparison({ versions }: { versions: AssetVersion[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [side, setSide] = useState('a');
  const [details, setDetails] = useState(false), [raw, setRaw] = useState(false);
  if (versions.length < 2) return null;
  const pair = selected.map(id => versions.find(v => v.id === id)).filter((v): v is AssetVersion => Boolean(v));
  const diff = pair.length === 2 ? compareRecipeFields(recipe(pair[0]), recipe(pair[1])) : null;
  const current = pair[side === 'a' ? 0 : 1];
  const fields = [...new Set(diff?.rows.map(row => differenceLabel(row.path)))];
  return <View style={{ gap: 14 }}>
    <SectionHeading title="比较两个版本" detail="仅预览，不改变采用版本" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {versions.map(v => <Pressable key={v.id} accessibilityRole="button" accessibilityLabel={`比较版本 ${v.versionNo}`} accessibilityState={{ selected: selected.includes(v.id) }} onPress={() => { setSelected(previous => previous.includes(v.id) ? previous.filter(id => id !== v.id) : [...previous.slice(-1), v.id]); setSide('a'); }} style={{ padding: 4, borderRadius: 12, borderWidth: 2, borderColor: selected.includes(v.id) ? COLORS.primary : COLORS.border, gap: 4, minHeight: 48 }}>
        <MediaPreview version={v} kind={v.mime?.startsWith('video/') ? 'video' : v.mime?.startsWith('image/') ? 'image' : 'document'} label={`版本 ${v.versionNo} 缩略图`} style={{ width: 72, aspectRatio: 1 }} />
        <Text style={[s.muted, { textAlign: 'center' }]}>{selected.indexOf(v.id) >= 0 ? `${selected.indexOf(v.id) === 0 ? 'A' : 'B'} · ` : ''}版本 {v.versionNo}</Text>
      </Pressable>)}
    </ScrollView>
    {pair.length === 2 && current ? <>
      <SegmentedChoices label="切换比较画面" options={[{ id: 'a', label: `A · 版本 ${pair[0].versionNo}` }, { id: 'b', label: `B · 版本 ${pair[1].versionNo}` }]} value={side} onChange={setSide} />
      {current.mime?.startsWith('image/') || current.mime?.startsWith('video/') ? <MediaPreview version={current} kind={current.mime.startsWith('video/') ? 'video' : 'image'} label={`比较画面：版本 ${current.versionNo}`} contain style={{ aspectRatio: 4 / 3 }} /> : null}
      {current.state === 'AVAILABLE' && ['text/plain', 'text/markdown', 'application/json'].includes(current.mime ?? '') ? <TextVersionPreview key={current.id} version={current} /> : null}
      <Text accessibilityLiveRegion="polite" style={s.muted}>{fields.length ? `不同的设置：${fields.join('、')}` : '记录的生成参数相同。'}{pair[0].blobSha256 && pair[0].blobSha256 === pair[1].blobSha256 ? ' 两个版本的文件内容相同。' : ''}</Text>
      <SettingRow label="参数差异" value={`${diff!.rows.length} 项${diff!.truncated ? '以上' : ''}`} expanded={details} onPress={() => setDetails(!details)} />
      {details ? <View style={{ gap: 14 }}>
        {diff?.rows.map(row => <View key={row.path} style={{ borderLeftWidth: 2, borderLeftColor: COLORS.primary, paddingLeft: 12, gap: 4 }}><Text style={[s.body, { fontWeight: '600' }]}>{differenceLabel(row.path)}</Text><Text selectable style={s.muted}>A：{row.before}</Text><Text selectable style={s.body}>B：{row.after}</Text></View>)}
        {diff?.truncated ? <Text style={s.muted}>仅展示前 80 项差异，长字段展示前 2000 字符。</Text> : null}
        <SettingRow label="技术详情" value="字段路径与原始参数" expanded={raw} onPress={() => setRaw(!raw)} />
        {raw ? <>{diff?.rows.map(row => <Text key={row.path} selectable style={s.muted}>{row.path}</Text>)}{pair.map(v => <View key={v.id}><Text style={s.title}>版本 {v.versionNo}</Text><Text selectable style={[s.muted, { fontFamily: 'monospace', fontSize: 12 }]}>{recipeText(v).slice(0, 20000)}</Text></View>)}</> : null}
      </View> : null}
    </> : <Text style={s.muted}>点选两个缩略图，在同一位置切换 A / B 对照。</Text>}
  </View>;
}
