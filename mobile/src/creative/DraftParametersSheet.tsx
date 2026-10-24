import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getDatabase } from '../storage/databaseClient';
import { readDraftInputs, type CreativeDraft } from './drafts';
import { ParameterSheet, TextAction } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';

/** Inspect the submitted snapshot without changing the draft or selected result. */
export function DraftParametersSheet({ draft, onClose }: { draft: CreativeDraft; onClose: () => void }) {
  const [references, setReferences] = useState<Awaited<ReturnType<typeof readDraftInputs>>>([]);
  const [error, setError] = useState('');
  const [raw, setRaw] = useState(false);
  useEffect(() => {
    let active = true;
    void readDraftInputs(getDatabase(), draft.id).then(rows => { if (active) setReferences(rows); })
      .catch(() => { if (active) setError('参考图读取失败，可关闭后重试'); });
    return () => { active = false; };
  }, [draft.id]);
  let input: Record<string, unknown> = {};
  try { input = JSON.parse(draft.input_json); } catch { /* Keep the original snapshot available below. */ }
  const summary = [input.model, input.resolution, input.width && input.height ? `${input.width} × ${input.height}` : '', input.duration ? `${input.duration} 秒` : '', input.seed !== null && input.seed !== undefined && input.seed !== '' ? `种子 ${input.seed}` : '随机种子'].filter(Boolean).join(' · ');
  return <ParameterSheet title="本次生成参数" fullScreen description="提交时的参数快照" onClose={onClose}>
    <Text style={s.muted}>{summary}</Text>
    <Text style={s.title}>画面描述</Text><Text selectable style={s.body}>{typeof input.prompt === 'string' ? input.prompt : '未记录描述'}</Text>
    {references.length ? <View style={{ gap: 12 }}><Text style={s.title}>参考图 · {references.length}</Text>{references.map((reference, index) => <View key={reference.version_id} style={{ gap: 4 }}>
      <Text style={s.muted}>参考图 {index + 1}</Text>
      {reference.state === 'AVAILABLE' ? <Image accessibilityLabel={`本次参考图 ${index + 1}`} source={{ uri: `${FileSystem.documentDirectory}${reference.relative_path}` }} resizeMode="contain" style={{ width: '100%', height: 180 }} /> : <Text style={s.muted}>原文件待恢复</Text>}
    </View>)}</View> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <TextAction label={raw ? '收起完整参数' : '查看完整参数'} onPress={() => setRaw(!raw)} />
    {raw ? <Text selectable style={s.muted}>{Object.keys(input).length ? JSON.stringify(input, null, 2) : draft.input_json}</Text> : null}
  </ParameterSheet>;
}
