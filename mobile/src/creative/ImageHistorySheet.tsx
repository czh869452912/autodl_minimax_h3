import {useResultHistory} from './useResultHistory';
import type {HistoryScope} from './resultHistory';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AssetVersion } from './types';
import { MediaPreview } from './MediaPreview';
import { IconAction, TextAction } from './WorkbenchUI';
import { COLORS } from '../ui/theme';
import { creativeUI as s } from './creativeUI';

export function resultImageDetails(version: AssetVersion) {
  const input = version.recipe.input as { prompt?: string; seed?: number; width?: number; height?: number } | undefined;
  const output = version.recipe.output as { seed?: number; width?: number; height?: number } | undefined;
  const seed = output?.seed ?? input?.seed;
  return { prompt: input?.prompt ?? '', width: output?.width ?? input?.width, height: output?.height ?? input?.height,
    seed: typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 4294967295 ? seed : undefined };
}

export function ImageHistorySheet({ versions: providedVersions, source, selectedId, locked, onLock, onSelect, onClose, onExport, inline=false, rail=false }: {
  source?:HistoryScope; versions: AssetVersion[]; selectedId?: string; locked: boolean; onLock: () => void;
  onSelect: (version: AssetVersion) => void; onClose: () => void;
  onExport?: (versions: AssetVersion[]) => Promise<void>;
  inline?:boolean;rail?:boolean;
}) {
  const [query,setQuery]=useState(''),[search,setSearch]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),250);return()=>clearTimeout(timer);},[query]);
  const paged=useResultHistory(source??{assetIds:[]},Boolean(source),search);
  const versions=source?paged.rows:providedVersions;
  const list=useRef<FlatList<AssetVersion>>(null);
  const newestId=versions[0]?.id;
  useEffect(()=>{if(!locked)list.current?.scrollToOffset({offset:0,animated:false});},[newestId,locked]);
  const [picks, setPicks] = useState<string[]>([]), [selecting, setSelecting] = useState(false);
  const [exporting, setExporting] = useState(false), [notice, setNotice] = useState('');
  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return source?versions:versions.filter(v => { const info = resultImageDetails(v); return !search || `${v.versionNo} ${info.prompt} ${info.seed ?? ''}`.toLowerCase().includes(search); });
  }, [versions, query,source]);
  const exportPicked = async () => {
    if (!onExport || exporting) return;
    setExporting(true); setNotice('');
    try { await onExport(versions.filter(v => picks.includes(v.id) && v.state === 'AVAILABLE' && v.relativePath)); setPicks([]); setNotice('已加入保存队列，可在任务中查看保存结果。'); }
    catch { setNotice('部分图片未能加入保存队列，请在任务中核查后重试。'); }
    finally { setExporting(false); }
  };
  const horizontal=inline&&!rail;
  const content=<View style={{ flex: 1, minHeight:0, backgroundColor: COLORS.surface }}>
      <View style={{ paddingHorizontal: inline?10:16,paddingVertical:4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ flex: 1 }}><Text accessibilityRole="header" style={[s.title,inline && {fontSize:12}]}>生成历史 · {versions.length}{source&&paged.next?'+':''}</Text>{!inline?<Text style={s.muted}>按需加载历史 · 搜索涵盖全部版本 · 选择仅切换预览</Text>:null}</View>
        {inline?<IconAction label={locked ? '已锁定历史滚动 · 点击恢复自动滚动' : '自动滚动到最新结果 · 点击锁定历史滚动'} selected={locked} icon="lock" onPress={onLock}/>:null}
        {inline && onExport?<TextAction label={selecting ? '退出多选' : '批量保存'} disabled={exporting} onPress={()=>{setSelecting(!selecting);setPicks([]);}}/>:null}
        <IconAction label="关闭生成历史" icon="close" onPress={onClose} />
      </View>
      <View style={{ paddingHorizontal: inline?8:16, paddingBottom: inline?4:8 }}>
        <TextInput accessibilityLabel="搜索生成历史" placeholder="搜索提示词、Seed 或版本号" placeholderTextColor={COLORS.textMuted} value={query} onChangeText={setQuery} style={[s.input, inline?{minHeight:34,paddingVertical:6,paddingHorizontal:10,fontSize:12,borderWidth:0,backgroundColor:COLORS.background,borderRadius:10}:{ minHeight: 44 }]} />
        {!inline?<TextAction label={locked ? '已锁定历史滚动 · 点击恢复自动滚动' : '自动滚动到最新结果 · 点击锁定历史滚动'} onPress={onLock} />:null}
        {onExport ? <View style={s.row}>{!inline?<TextAction label={selecting ? '退出多选' : '批量保存'} disabled={exporting} onPress={() => { setSelecting(!selecting); setPicks([]); }} />:null}{selecting ? <><TextAction label={source?"选择已加载结果":"选择筛选结果"} disabled={exporting} onPress={() => setPicks(rows.filter(v => v.state === 'AVAILABLE' && v.relativePath).map(v => v.id))} /><TextAction label={exporting ? '加入保存队列中…' : `保存所选 ${picks.length} 张`} disabled={exporting || !picks.length} onPress={() => void exportPicked()} /></> : null}</View> : null}
        {paged.error?<TextAction label="历史读取失败 · 重试" disabled={paged.loading} onPress={paged.loadMore}/>:null}
        {notice ? <Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text> : null}
      </View>
      <FlatList ref={list} maintainVisibleContentPosition={locked?{minIndexForVisible:0}:undefined} key={horizontal?'strip':'grid'} horizontal={horizontal} data={rows} numColumns={horizontal?1:2} keyExtractor={v => v.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding:inline?6:12, gap:inline?6:12 }} columnWrapperStyle={horizontal?undefined:{ gap: 8 }} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5} onEndReached={source&&paged.next?paged.loadMore:undefined} onEndReachedThreshold={0.4} ListFooterComponent={source&&paged.next?<TextAction label={paged.loading?"正在加载…":"加载更早结果"} disabled={paged.loading} onPress={paged.loadMore}/>:null}
        ListEmptyComponent={<Text style={[s.muted, { padding: 16 }]}>{paged.loading?'正在读取历史…':versions.length || search ? '没有匹配结果，试试其他提示词或 Seed。' : '生成完成后，图片会自动保存在这里。'}</Text>}
        renderItem={({ item }) => { const info = resultImageDetails(item), checked=selecting?picks.includes(item.id):item.id===selectedId; return <Pressable accessibilityRole={selecting?'checkbox':'button'} accessibilityLabel={`${selecting?'选择':'查看'}版本 ${item.versionNo}`} accessibilityState={selecting?{checked,disabled:exporting || item.state!=='AVAILABLE'}:{ selected: checked }} disabled={exporting || selecting && (item.state!=='AVAILABLE' || !item.relativePath)} onPress={() => { if(selecting){setPicks(old=>old.includes(item.id)?old.filter(id=>id!==item.id):[...old,item.id]);return;} onSelect(item); if(!inline)onClose(); }} style={{ width: horizontal?112:'48%', padding: inline?4:6, borderRadius: 10, backgroundColor:checked?COLORS.primarySoft:COLORS.background,borderWidth: 1, borderColor: checked ? COLORS.primary : COLORS.border, gap: 2 }}>
          <MediaPreview contain version={item} kind="image" label={`版本 ${item.versionNo} 预览`} style={horizontal?{width:'100%',flex:1,minHeight:32,aspectRatio:undefined,borderRadius:6}:{ width: '100%', aspectRatio: 1 }} />
          <Text numberOfLines={1} style={[s.body,inline && {fontSize:11,lineHeight:15}]}>{selecting?(checked?'已选 · ':'未选 · '):''}v{item.versionNo}{info.width && info.height ? ` · ${info.width} × ${info.height}` : ''}</Text>
          {!horizontal?<Text numberOfLines={2} style={[s.muted,inline && {fontSize:11,lineHeight:15}]}>{info.prompt || '无提示词记录'}</Text>:null}
          {!horizontal?<Text numberOfLines={1} style={[s.muted,inline && {fontSize:10,lineHeight:14}]}>Seed {info.seed ?? '未记录'}</Text>:null}
          {item.state !== 'AVAILABLE' ? <Text style={s.muted}>原件待恢复</Text> : null}
        </Pressable>; }} />
    </View>;
  return inline?content:<Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:COLORS.surface}}>{content}</SafeAreaView></Modal>;
}
