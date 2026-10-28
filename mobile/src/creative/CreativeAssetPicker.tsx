import { KeyboardSurface } from '../ui/KeyboardSurface';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { creativeFiles, creativeService } from './runtime';
import type { AssetVersion } from './types';
import { ListAction } from '../ui/ListPageUI';
import { creativeUI as s } from './creativeUI';
import { MediaPreview } from './MediaPreview';
import { TextAction } from './WorkbenchUI';
import { COLORS } from '../ui/theme';

export function CreativeAssetPicker({ kind, projectId, onChoose, onClose }: { kind: 'image' | 'video'|'audio'; projectId?: string; onChoose: (version: AssetVersion) => Promise<void>; onClose: () => void }) {
  const [items, setItems] = useState<Array<{ title: string; version: AssetVersion }>>([]);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(!projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<{createdAt:number;id:string}>();
  const [next, setNext] = useState<{createdAt:number;id:string}>();
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>();
  const [search, setSearch] = useState('');
  const [retry,setRetry]=useState(0);
  const waiting=loading||query.trim()!==search;
  const lock = useRef(false);
  useEffect(() => {
    if (!query) { setSearch(''); return; }
    const timer=setTimeout(()=>setSearch(query.trim()),250);
    return()=>clearTimeout(timer);
  },[query]);
  const scope=JSON.stringify([kind,projectId,all,search]);
  const scopeRef=useRef(scope);
  useEffect(() => {
    const reset=scopeRef.current!==scope;
    scopeRef.current=scope;
    if(reset){setSelected(undefined);setItems([]);setCursor(undefined);setNext(undefined);if(cursor)return;}
    let active = true; setLoading(true);
    void creativeService().availableVersionPage({kind,projectId:all?undefined:projectId,query:search,after:cursor})
      .then(page=>{if(active){setItems(old=>cursor?[...old,...page.items.filter(item=>!old.some(v=>v.version.id===item.version.id))]:page.items);setNext(page.next);setError('');}})
      .catch(()=>{if(active)setError('素材读取失败，请重试');})
      .finally(()=>{if(active)setLoading(false);});
    return () => { active = false; };
  }, [scope, cursor, retry]);
  const chosen = items.find(item => item.version.id === selected);
  const confirm = () => {
    if (lock.current || !chosen || waiting) return;
    lock.current = true; setBusy(true); setError('');
    void creativeFiles().verify(chosen.version.id).then(() => onChoose(chosen.version)).then(onClose).catch(e => setError(e instanceof Error ? e.message : '选材失败')).finally(() => { lock.current = false; setBusy(false); });
  };
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}><SafeAreaView style={s.screen}><KeyboardSurface style={{flex:1}}>
    <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
    <View style={s.row}><Text style={s.title}>{kind === 'image' ? '选择图片' : kind==='audio'?'选择音频':'选择视频'}</Text><TextAction label="取消" disabled={busy} onPress={onClose} /></View>
    <TextInput accessibilityLabel="搜索素材" placeholder="搜索素材名称" value={query} editable={!busy} onChangeText={setQuery} style={s.input} />
    {projectId ? <TextAction label={all ? '仅看本项目' : '从全部素材选择'} disabled={busy} onPress={() => setAll(!all)} /> : null}
    <Text style={s.muted}>{loading ? '正在读取素材…' : `点选画面后确认 · ${items.length} 个可用版本`}</Text>
    {error ? <View><Text accessibilityRole="alert" style={s.error}>{error}</Text><TextAction label="重新读取素材" disabled={busy||waiting} onPress={()=>setRetry(n=>n+1)}/></View> : null}
    </View>
    <FlatList data={items} numColumns={2} keyExtractor={item => item.version.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 12 }} columnWrapperStyle={{ gap: 12 }}
      renderItem={({ item: { title, version } }) => <Pressable accessibilityRole="button" accessibilityLabel={`选择 ${title} · 版本 ${version.versionNo}`} accessibilityState={{ selected: selected === version.id, disabled: busy || waiting }} disabled={busy || waiting} onPress={() => setSelected(version.id)} style={{ flex: 1, maxWidth: '50%', padding: 6, gap: 6, borderWidth: 2, borderColor: selected === version.id ? COLORS.primary : COLORS.border, borderRadius: 16 }}>
        <MediaPreview version={version} kind={kind} label={title} style={{ aspectRatio: 1 }} />
        <Text style={[s.body, { fontSize: 14 }]} numberOfLines={2}>{title}</Text><Text style={s.muted}>{selected === version.id ? '已选择 · ' : ''}版本 {version.versionNo}</Text>
      </Pressable>}
      ListEmptyComponent={!loading ? <Text style={s.muted}>{query ? '没有匹配的可用版本，请调整搜索。' : `暂无可用${kind === 'image' ? '图片' : kind==='audio'?'音频':'视频'}。可先导入素材或生成候选。`}</Text> : null}
      ListFooterComponent={next ? <TextAction label="加载更多素材" disabled={busy || waiting} onPress={() => setCursor(next)} /> : null} />
    <View style={s.footer}><Text style={s.muted}>{chosen ? `${chosen.title} · 版本 ${chosen.version.versionNo}` : '尚未选择素材'}</Text><ListAction label={busy ? '正在添加…' : kind === 'image' ? '使用所选图片' : kind==='audio'?'使用所选音频':'使用所选视频'} disabled={busy || waiting || !chosen} onPress={confirm} /></View>
  </KeyboardSurface></SafeAreaView></Modal>;
}
