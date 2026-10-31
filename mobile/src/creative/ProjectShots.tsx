import {RecordRow} from '../ui/RecordRow';
import { shotStage } from './workPresentation';
import { IconAction } from './WorkbenchUI';
import { SafeAreaView } from 'react-native-safe-area-context';
import { creativeError } from './creativeError';
import type { CreativeDraft } from './drafts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Text, TextInput, View } from 'react-native';
import { KeyboardSurface, KeyboardAwareScrollView as ScrollView } from '../ui/KeyboardSurface';
import { useFocusEffect, useRouter } from 'expo-router';
import { CreativeAssetPicker } from './CreativeAssetPicker';
import { VersionThumbnail } from './VersionThumbnail';
import { creativeService } from './runtime';
import { createId } from '../ids';
import { ListAction } from '../ui/ListPageUI';
import { COLORS } from '../ui/theme';
import type { CreativeShot } from './story';
import type { CreativeCommand } from './types';

export function ProjectShots({ projectId, archived = false, initialShotId, requestId, onEditorState }: { projectId: string; archived?: boolean; initialShotId?:string;requestId?:string; onEditorState?: (state: { dirty: boolean; busy: boolean }) => void }) {
  const router = useRouter();
  const [draftsOpen,setDraftsOpen]=useState<string>();
  const [focused,setFocused]=useState(initialShotId);
  useEffect(()=>setFocused(initialShotId),[initialShotId,requestId]);
  const [drafts, setDrafts] = useState<CreativeDraft[]>([]);
  const [shots, setShots] = useState<CreativeShot[]>([]);
  const [expanded, setExpanded] = useState<string>(), [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CreativeShot>();
  const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [choosing, setChoosing] = useState<{ shot: CreativeShot; slot: 'selected_image' | 'selected_video' }>();
  const original = shots.find(s => s.id === editing?.id);
  const dirty = adding && (editing ? title !== original?.title || description !== original?.description || editing.editorial_status !== original?.editorial_status : Boolean(title || description));
  useEffect(() => { onEditorState?.({ dirty, busy }); }, [dirty, busy, onEditorState]);
  useEffect(() => () => onEditorState?.({ dirty: false, busy: false }), [onEditorState]);
  const switchEditor = (next: () => void) => {
    if (dirty) Alert.alert('尚有未保存的镜头修改', '继续编辑，或放弃本次修改。', [{ text: '继续编辑', style: 'cancel' }, { text: '放弃修改', onPress: next }]);
    else next();
  };
  const closeEditor = () => { setError(''); setAdding(false); setEditing(undefined); setTitle(''); setDescription(''); };
  const refresh = async () => { const [shots, drafts] = await Promise.all([creativeService().shots(projectId), creativeService().drafts(projectId)]); setShots(shots); setDrafts(drafts); };
  const openDraft = (d: CreativeDraft) => router.push({ pathname: d.provider_id === 'novelai' ? '/image-draft/[id]' : '/creative-draft/[id]', params: { id: d.id } });
  useFocusEffect(useCallback(() => { void refresh().catch(() => setError('镜头读取失败')); }, [projectId]));
  const work = async (callback: () => Promise<unknown>, readOnly = false) => {
    if (lock.current || (archived && !readOnly)) return; lock.current = true; setBusy(true); setError('');
    try { await callback(); await refresh(); } catch (e) { setError(creativeError(e, '操作失败')); }
    finally { lock.current = false; setBusy(false); }
  };
  const command = (command: CreativeCommand) => creativeService().execute(command, createId());
  const action = (label: string, callback: () => void, secondary = true) => <ListAction label={label} secondary={secondary} disabled={busy || archived} onPress={callback} />;
  const choose = (shot: CreativeShot, slot: 'selected_image' | 'selected_video') => setChoosing({shot,slot});
  const reorder = (index: number, direction: number) => work(async () => {
    const ordered = [...shots]; [ordered[index], ordered[index + direction]] = [ordered[index + direction], ordered[index]];
    await command({ name: 'shot.reorder', payload: { projectId, shots: ordered.map(s => ({ id: s.id, expectedRevision: s.revision })) } });
  });
  const labels = { planned: '计划中', working: '制作中', review: '待审阅', approved: '已选定' };
  return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: COLORS.text, fontSize: 20, fontWeight: '700' }}>镜头清单</Text>
    {dirty ? <Text style={{ color: COLORS.textMuted }}>镜头修改尚未保存，请保存或取消编辑后继续制作。</Text> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: COLORS.danger }}>{error}</Text> : null}
    {choosing ? <CreativeAssetPicker purpose="adopt" target={choosing.shot.title} kind={choosing.slot === 'selected_image' ? 'image' : 'video'} projectId={projectId} onCreateReference={choosing.slot==='selected_image'?async()=>{const result=await command({name:'draft.createImage',payload:{projectId,shotId:choosing.shot.id}});if(result.status==='completed')router.push({pathname:'/image-draft/[id]',params:{id:result.value.draftId}});}:undefined} onClose={() => setChoosing(undefined)} onChoose={async v => {
      await command({ name: 'shot.selectOutput', payload: { id: choosing.shot.id, expectedRevision: choosing.shot.revision, slot: choosing.slot, versionId: v.id } });
      await refresh();
    }} /> : null}
    {focused?<View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={{color:COLORS.textMuted}}>{shots.some(s=>s.id===focused)?'当前创作镜头':'原镜头已不可用'}</Text><ListAction label="全部镜头" secondary onPress={()=>setFocused(undefined)}/></View>:null}
    {shots.filter(shot=>!focused||!shots.some(s=>s.id===focused)||shot.id===focused).map(shot => {const index=shots.indexOf(shot);const shotDrafts=drafts.filter(d=>d.shot_id===shot.id&&['EDITING','SUBMITTED'].includes(d.state)).sort((a,b)=>(b.updated_at??0)-(a.updated_at??0)||a.id.localeCompare(b.id));const videoDraft=shotDrafts.find(d=>d.provider_id!=='novelai'&&d.state==='EDITING');return <View key={shot.id} style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, gap: 8 }}>
      <View style={{flexDirection:"row",alignItems:"center",gap:6}}><Text style={{flex:1,color:COLORS.text,fontWeight:"700"}}>{index + 1}. {shot.title} · {labels[shot.editorial_status]}</Text><IconAction label={expanded===shot.id?"收起镜头操作":"更多镜头操作"} icon="more_horiz" onPress={()=>setExpanded(expanded===shot.id?undefined:shot.id)}/></View><View style={{flexDirection:'row',gap:10,alignItems:'center'}}>{shot.selected_image?<VersionThumbnail versionId={shot.selected_image} compact/>:null}<Text numberOfLines={3} style={{flex:1,color:COLORS.textMuted,fontSize:13,lineHeight:19}}>{shot.description || '尚未填写镜头描述'}</Text></View>
      <Text style={{ color: COLORS.textMuted }}>图片：{shot.selected_image ? '已固定版本' : '未选定'} · 视频：{shot.selected_video ? '已固定版本' : '未选定'}</Text>
      <ListAction label={shotStage(shot).kind==='video'&&videoDraft?'继续制作视频':shotStage(shot).label} disabled={busy || dirty || (archived && !shot.selected_video)} onPress={() => {
        if (shot.selected_video) { void work(async () => { router.push({pathname:'/creative-shot/[id]',params:{id:shot.id,projectId}}); }, true); return; }
        if (shotStage(shot).kind === 'restore') { if(shot.image_asset_id)router.push({pathname:'/creative-asset/[id]',params:{id:shot.image_asset_id,versionId:shot.selected_image!}});else setError('原版本引用不可用，请从项目素材核查'); return; }
        if (!shot.selected_image) { choose(shot,'selected_image'); return; }
        if(videoDraft){openDraft(videoDraft);return;}
        void work(async () => { const r=await command({name:'draft.createVideo',payload:{shotId:shot.id,projectId}});if(r.status==='completed')router.push({pathname:'/creative-draft/[id]',params:{id:r.value.draftId}}); });
      }} />
      <ListAction label="交给助手" secondary disabled={busy || dirty || archived} onPress={()=>router.push({pathname:'/(tabs)/agent',params:{projectId,shotId:shot.id,shotTitle:shot.title}})}/>
      {shot.selected_image ? <ListAction label="更换参考图" secondary disabled={busy || dirty || archived} onPress={() => choose(shot, 'selected_image')} /> : null}
      {!shot.selected_image ? <ListAction label="制作新的参考图" secondary disabled={busy || dirty || archived} onPress={() => void work(async () => { const r=await command({name:'draft.createImage',payload:{projectId,shotId:shot.id}});if(r.status==='completed')router.push({pathname:'/image-draft/[id]',params:{id:r.value.draftId}}); })} /> : null}
      {shotDrafts.length>1?<ListAction secondary label={draftsOpen===shot.id?'收起草稿':`${shotDrafts.length} 份草稿与生成记录`} onPress={()=>setDraftsOpen(draftsOpen===shot.id?undefined:shot.id)}/>:null}
      {(draftsOpen===shot.id?shotDrafts:shotDrafts.slice(0,1)).map(draft=><RecordRow key={draft.id} title={`${draft.state==='EDITING'?'继续':'查看'}${draft.provider_id==='novelai'?'图片':'视频'}草稿 · ${draft.id.slice(-8)}`} detail={draft.state==='SUBMITTED'?'查看进度与候选':'编辑中'} meta={draft.updated_at?new Date(draft.updated_at).toLocaleString():undefined} disabled={busy||dirty||(archived&&draft.state==='EDITING')} onPress={()=>openDraft(draft)}/>)}
      {expanded===shot.id ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {action('编辑镜头', () => switchEditor(() => { setError(''); setAdding(true); setEditing(shot); setTitle(shot.title); setDescription(shot.description); }))}
        {action('选定图片', () => void choose(shot, 'selected_image'))}{action('选定视频', () => void choose(shot, 'selected_video'))}
        {action('另建视频草稿', () => void work(async () => { const result = await command({ name: 'draft.createVideo', payload: { shotId: shot.id, projectId } }); if (result.status === 'completed') router.push({ pathname: '/creative-draft/[id]', params: { id: result.value.draftId } }); }))}
        {index > 0 ? action('上移', () => void reorder(index, -1)) : null}{index < shots.length - 1 ? action('下移', () => void reorder(index, 1)) : null}
        {action('移除镜头', () => Alert.alert('移除镜头', '素材和版本仍保留在资产库。', [{ text: '取消', style: 'cancel' }, { text: '移除', onPress: () => void work(async () => { await command({ name: 'shot.delete', payload: { id: shot.id, expectedRevision: shot.revision } }); if (editing?.id === shot.id) { setEditing(undefined); setTitle(''); setDescription(''); } }) }]))}
      </View> : null}
    </View>;})}
    {!shots.length ? <Text style={{ color: COLORS.textMuted }}>添加镜头，逐个确定参考图和视频成果。</Text> : null}
    {!archived ? action(adding ? '取消编辑镜头' : '添加镜头', () => switchEditor(() => {setError('');setAdding(!adding);setEditing(undefined);setTitle('');setDescription('');})) : null}
    {!archived && adding ? <Modal visible animationType="slide" onRequestClose={() => switchEditor(closeEditor)}><SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}><KeyboardSurface style={{flex:1}}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}><ListAction label="关闭镜头编辑" secondary disabled={busy} onPress={() => switchEditor(closeEditor)} />
      <Text style={{ color: COLORS.text, fontWeight: '700' }}>{editing ? '编辑镜头' : '添加镜头'}</Text>
      {error ? <Text accessibilityRole="alert" style={{ color: COLORS.danger }}>{error}</Text> : null}
      <Text style={{ color: COLORS.text }}>镜头名称</Text>
      <TextInput accessibilityLabel="镜头名称" placeholder="镜头名称" value={title} editable={!busy} onChangeText={setTitle} style={{ borderWidth: 1, borderColor: COLORS.controlBorder, color: COLORS.text, padding: 12, borderRadius: 8 }} />
      <Text style={{ color: COLORS.text }}>动作与运镜</Text>
      <TextInput accessibilityLabel="镜头描述" placeholder="动作、运镜、节奏与声音" value={description} editable={!busy} multiline onChangeText={setDescription} style={{ borderWidth: 1, borderColor: COLORS.controlBorder, color: COLORS.text, padding: 12, minHeight: 90, borderRadius: 8 }} />
      {action(editing ? '保存镜头' : '创建镜头', () => void work(async () => {
        await command(editing ? { name: 'shot.update', payload: { id: editing.id, expectedRevision: editing.revision, title, description, status: editing.editorial_status } } : { name: 'shot.create', payload: { projectId, title, description } });
        setEditing(undefined); setTitle(''); setDescription(''); setAdding(false);
      }), false)}
      {editing ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{Object.entries(labels).map(([status, label]) => <View key={status}>{action(`${editing.editorial_status === status ? '✓ ' : ''}${label}`, () => setEditing({ ...editing, editorial_status: status as CreativeShot['editorial_status'] }))}</View>)}</View> : null}
    </ScrollView></KeyboardSurface></SafeAreaView></Modal> : null}
  </View>;
}
