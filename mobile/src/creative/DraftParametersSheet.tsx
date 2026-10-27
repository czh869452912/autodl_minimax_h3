import {quoteLabel,type VideoQuote} from './autodlPricing';
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
  const [cost,setCost]=useState<VideoQuote>();
  const [submitted,setSubmitted]=useState<Record<string,unknown>>();
  useEffect(() => {
    let active = true;
    const db=getDatabase();setSubmitted(undefined);setCost(undefined);
    if(draft.job_id)void db.getFirstAsync<{input_snapshot_json:string}>('SELECT input_snapshot_json FROM creative_job_contexts WHERE job_id=?',draft.job_id).then(row=>{if(active&&row){const q=JSON.parse(row.input_snapshot_json)._costEstimate;if(q?.unit==='CNY'&&Number.isFinite(q.minimum)&&Number.isFinite(q.maximum))setCost(q);}}).catch(()=>undefined);
    void Promise.all([readDraftInputs(db,draft.id),draft.job_id?db.getFirstAsync<{input_json:string}>('SELECT input_json FROM workflow_jobs WHERE id=?',draft.job_id):Promise.resolve(null)]).then(([rows,job])=>{
      if(!active)return;setReferences(rows);
      if(job?.input_json){const snapshot=JSON.parse(job.input_json);if(snapshot&&typeof snapshot==='object')setSubmitted(snapshot);}
    }).catch(() => { if (active) setError('提交快照读取失败，可关闭后重试'); });
    return () => { active = false; };
  }, [draft.id]);
  let input: Record<string, unknown> = {};
  try { input = JSON.parse(draft.input_json); } catch { /* Keep the original snapshot available below. */ }
  if(input.schemaVersion===2&&input.values&&typeof input.values==='object')input={...(input.values as Record<string,unknown>),prompt:input.prompt,workflow:input.workflow};
  if(submitted)input={...input,...submitted};
  const summary = [input.model, input.resolution, input.width && input.height ? `${input.width} × ${input.height}` : '', input.duration ? `${input.duration} 秒` : '', input.seed !== null && input.seed !== undefined && input.seed !== '' ? `种子 ${input.seed}` : '随机种子'].filter(Boolean).join(' · ');
  return <ParameterSheet title="本次生成参数" fullScreen description="提交时的参数快照" onClose={onClose}>
    <Text style={s.muted}>{summary}</Text>
    {cost?<Text style={s.muted}>提交时{quoteLabel(cost)} · 非实际扣款</Text>:null}
    {input.workflow?<Text style={s.muted}>工作流：{String((input.workflow as {title?:string;id?:string}).title??(input.workflow as {id?:string}).id??draft.workflow_id)} · v{String((input.workflow as {version?:string}).version??'')}</Text>:null}
    <Text style={s.title}>画面描述</Text><Text selectable style={s.body}>{typeof input.prompt === 'string' ? input.prompt : '未记录描述'}</Text>
    {references.length ? <View style={{ gap: 12 }}><Text style={s.title}>参考素材 · {references.length}</Text>{references.map((reference, index) => <View key={reference.version_id} style={{ gap: 4 }}>
      <Text style={s.muted}>{reference.slot==='audio'?'音频':'参考图'} {index + 1}</Text>
      {reference.state === 'AVAILABLE' ? reference.slot==='audio'?<Text style={s.muted}>{reference.mime} · 已固定本次音频版本</Text>:<Image accessibilityLabel={`本次参考图 ${index + 1}`} source={{ uri: `${FileSystem.documentDirectory}${reference.relative_path}` }} resizeMode="contain" style={{ width: '100%', height: 180 }} /> : <Text style={s.muted}>原文件待恢复</Text>}
    </View>)}</View> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <TextAction label={raw ? '收起完整参数' : '查看完整参数'} onPress={() => setRaw(!raw)} />
    {raw ? <Text selectable style={s.muted}>{Object.keys(input).length ? JSON.stringify(input, null, 2) : draft.input_json}</Text> : null}
  </ParameterSheet>;
}
