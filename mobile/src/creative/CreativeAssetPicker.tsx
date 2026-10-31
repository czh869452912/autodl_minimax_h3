import { KeyboardSurface } from '../ui/KeyboardSurface';
import { useFocusEffect } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { pickImagesFromGallery } from '../native/imagePicker';
import { creativeFiles, creativeService, importCreativeImage } from './runtime';
import type { AssetVersion } from './types';
import { ListAction } from '../ui/ListPageUI';
import { creativeUI as s } from './creativeUI';
import { MediaPreview } from './MediaPreview';
import { TextAction } from './WorkbenchUI';
import { COLORS } from '../ui/theme';

export function CreativeAssetPicker({ kind, projectId, purpose, target, onCreateReference, onChoose, onClose }: { kind: 'image' | 'video'|'audio'; projectId?: string;purpose?:'reference'|'source'|'mask'|'adopt'|'cover';target?:string; onCreateReference?:()=>Promise<void>; onChoose: (version: AssetVersion) => Promise<void>; onClose: () => void }) {
  const focused=useIsFocused();
  const [items, setItems] = useState<Array<{ title: string; version: AssetVersion }>>([]);
  const [imported,setImported]=useState<{title:string;version:AssetVersion}>();
  const [query, setQuery] = useState('');
  const [adding,setAdding]=useState(false);
  const [all, setAll] = useState(!projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<{createdAt:number;id:string}>();
  const [next, setNext] = useState<{createdAt:number;id:string}>();
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>();
  const [search, setSearch] = useState('');
  const [retry,setRetry]=useState(0);
  useFocusEffect(useCallback(()=>{setCursor(undefined);setRetry(n=>n+1);},[]));
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
    if(reset){if(!imported)setSelected(undefined);setItems([]);setCursor(undefined);setNext(undefined);if(cursor)return;}
    let active = true; setLoading(true);
    void creativeService().availableVersionPage({kind,projectId:all?undefined:projectId,query:search,after:cursor})
      .then(page=>{if(active){setItems(old=>cursor?[...old,...page.items.filter(item=>!old.some(v=>v.version.id===item.version.id))]:page.items);setNext(page.next);setError('');}})
      .catch(()=>{if(active)setError('素材读取失败，请重试');})
      .finally(()=>{if(active)setLoading(false);});
    return () => { active = false; };
  }, [scope, cursor, retry]);
  const importImage = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const [image] = await pickImagesFromGallery(1);
      if (!image) return;
      const result = await importCreativeImage(image, projectId);
      if (result.status !== 'completed') throw new Error('导入尚未完成');
      const [version] = await creativeService().versionsByIds([result.value.versionId]);
      if (!version) throw new Error('导入版本暂不可用，请重新读取');
      setQuery(''); setSearch(''); setCursor(undefined); setNext(undefined);
      setImported({title:image.name,version}); setSelected(version.id);
      // Keep the imported version visible even if it is an older deduplicated import.
    } catch (e) { setError(e instanceof Error ? e.message : '导入失败，请重试'); }
    finally { lock.current = false; setBusy(false); }
  };
  const intent=purpose==='cover'?'设为项目封面':purpose==='mask'?'作为重绘遮罩':purpose==='source'?'作为图生图原图':purpose==='adopt'?'采用为镜头成果':purpose==='reference'?'加入参考素材':'';
  const visibleItems = imported && !search ? [imported,...items.filter(item=>item.version.id!==imported.version.id)] : items;
  const chosen = visibleItems.find(item => item.version.id === selected);
  const confirm = () => {
    if (lock.current || !chosen || waiting) return;
    lock.current = true; setBusy(true); setError('');
    void creativeFiles().verify(chosen.version.id).then(() => onChoose(chosen.version)).then(onClose).catch(e => setError(e instanceof Error ? e.message : '选材失败')).finally(() => { lock.current = false; setBusy(false); });
  };
  return <Modal visible={focused} animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}><SafeAreaView style={s.screen}><KeyboardSurface style={{flex:1}}>
    <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
    <View style={s.row}><Text style={s.title}>{purpose==='cover'?'选择项目封面':kind === 'image' ? '选择图片' : kind==='audio'?'选择音频':'选择视频'}</Text><TextAction label="取消" disabled={busy} onPress={onClose} /></View>
    {intent?<Text style={s.muted}>{intent}{target?' · '+target:''}</Text>:null}
    <TextInput accessibilityLabel="搜索素材" placeholder="搜索素材名称" value={query} editable={!busy} onChangeText={setQuery} style={s.input} />
    {projectId ? <TextAction label={all ? '仅看本项目' : '从全部素材选择'} disabled={busy} onPress={() => setAll(!all)} /> : null}
    {kind==='image'&&visibleItems.length>0?<TextAction label={adding?'收起新增素材':'新增素材'} disabled={busy} onPress={()=>setAdding(!adding)}/>:null}
    {(adding||(!search&&!visibleItems.length&&!waiting&&!error))&&onCreateReference ? <TextAction label="制作参考图" disabled={busy || waiting} onPress={()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');void onCreateReference().catch(e=>setError(e instanceof Error?e.message:'无法创建草稿')).finally(()=>{lock.current=false;setBusy(false);});}}/> : null}
    {kind === 'image' && (adding||(!search&&!visibleItems.length&&!waiting&&!error)) ? <TextAction label="从设备导入图片" disabled={busy || waiting} onPress={() => void importImage()} /> : null}
    <Text style={s.muted}>{loading ? '正在读取素材…' : `点选画面后确认 · ${visibleItems.length} 个可用版本`}</Text>
    {error ? <View><Text accessibilityRole="alert" style={s.error}>{error}</Text><TextAction label="重新读取素材" disabled={busy||waiting} onPress={()=>setRetry(n=>n+1)}/></View> : null}
    </View>
    <FlatList data={visibleItems} numColumns={2} keyExtractor={item => item.version.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 12 }} columnWrapperStyle={{ gap: 12 }}
      renderItem={({ item: { title, version } }) => <Pressable accessibilityRole="button" accessibilityLabel={`选择 ${title} · 版本 ${version.versionNo}`} accessibilityState={{ selected: selected === version.id, disabled: busy || waiting }} disabled={busy || waiting} onPress={() => setSelected(version.id)} style={{ flex: 1, maxWidth: '50%', padding: 6, gap: 6, borderWidth: 2, borderColor: selected === version.id ? COLORS.primary : COLORS.border, borderRadius: 16 }}>
        <MediaPreview version={version} kind={kind} label={title} style={{ aspectRatio: 1 }} />
        <Text style={[s.body, { fontSize: 14 }]} numberOfLines={2}>{title}</Text><Text style={s.muted}>{selected === version.id ? '已选择 · ' : ''}版本 {version.versionNo}</Text>
      </Pressable>}
      ListEmptyComponent={!waiting && !error ? <View style={{ gap: 12, paddingVertical: 24 }}>
        <Text accessibilityRole="header" style={s.title}>{search ? '没有匹配的素材' : !all && projectId ? '本项目暂无可用版本' : '素材库暂无可用版本'}</Text>
        <Text style={s.muted}>{search ? '清除搜索，查看当前范围内的素材。' : !all && projectId ? '从全部素材中选择具体版本，确认后才会用于当前目标。' : '取消选择，导入素材或制作候选后再回来选择。'}</Text>
        {search ? <ListAction label="清除搜索" secondary disabled={busy} onPress={() => setQuery('')} /> : null}
      </View> : null}
      ListFooterComponent={next ? <TextAction label="加载更多素材" disabled={busy || waiting} onPress={() => setCursor(next)} /> : null} />
    <View style={s.footer}><Text style={s.muted}>{chosen ? `${chosen.title} · 版本 ${chosen.version.versionNo}` : '尚未选择素材'}</Text><ListAction label={busy ? '正在添加…' : intent || (kind === 'image' ? '使用所选图片' : kind==='audio'?'使用所选音频':'使用所选视频')} disabled={busy || waiting || !chosen} onPress={confirm} /></View>
  </KeyboardSurface></SafeAreaView></Modal>;
}
