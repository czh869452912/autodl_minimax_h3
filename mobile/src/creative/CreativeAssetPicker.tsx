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

export function CreativeAssetPicker({ kind, projectId, onChoose, onClose }: { kind: 'image' | 'video'; projectId?: string; onChoose: (version: AssetVersion) => Promise<void>; onClose: () => void }) {
  const [items, setItems] = useState<Array<{ title: string; version: AssetVersion }>>([]);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(!projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(100), [hasMore, setHasMore] = useState(false);
  useEffect(() => setLimit(100), [kind, projectId, all, query]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>();
  useEffect(() => setSelected(undefined), [kind, projectId, all, query]);
  const lock = useRef(false);
  useEffect(() => {
    let active = true; setLoading(true);
    void (async () => {
      const assets = await creativeService().assets({ projectId: all ? undefined : projectId, query, kind, limit });
      const rows = await Promise.all(assets.filter(a => a.kind === kind).map(async a => (await creativeService().versions(a.id)).filter(v => v.state === 'AVAILABLE').map(version => ({ title: a.title, version }))));
      if (active) { setItems(rows.flat()); setHasMore(assets.length >= limit); setError(''); }
    })().catch(() => { if (active) setError('素材读取失败，请修改搜索条件重试'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, projectId, all, query, limit]);
  const chosen = items.find(item => item.version.id === selected);
  const confirm = () => {
    if (lock.current || !chosen || loading) return;
    lock.current = true; setBusy(true); setError('');
    void creativeFiles().verify(chosen.version.id).then(() => onChoose(chosen.version)).then(onClose).catch(e => setError(e instanceof Error ? e.message : '选材失败')).finally(() => { lock.current = false; setBusy(false); });
  };
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}><SafeAreaView style={s.screen}>
    <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
    <View style={s.row}><Text style={s.title}>{kind === 'image' ? '选择图片' : '选择视频'}</Text><TextAction label="取消" disabled={busy} onPress={onClose} /></View>
    <TextInput accessibilityLabel="搜索素材" placeholder="搜索素材名称" value={query} editable={!busy} onChangeText={setQuery} style={s.input} />
    {projectId ? <TextAction label={all ? '仅看本项目' : '从全部素材选择'} disabled={busy} onPress={() => setAll(!all)} /> : null}
    <Text style={s.muted}>{loading ? '正在读取素材…' : `点选画面后确认 · ${items.length} 个可用版本`}</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    </View>
    <FlatList data={items} numColumns={2} keyExtractor={item => item.version.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 12 }} columnWrapperStyle={{ gap: 12 }}
      renderItem={({ item: { title, version } }) => <Pressable accessibilityRole="button" accessibilityLabel={`选择 ${title} · 版本 ${version.versionNo}`} accessibilityState={{ selected: selected === version.id, disabled: busy || loading }} disabled={busy || loading} onPress={() => setSelected(version.id)} style={{ flex: 1, maxWidth: '50%', padding: 6, gap: 6, borderWidth: 2, borderColor: selected === version.id ? COLORS.primary : COLORS.border, borderRadius: 16 }}>
        <MediaPreview version={version} kind={kind} label={title} style={{ aspectRatio: 1 }} />
        <Text style={[s.body, { fontSize: 14 }]} numberOfLines={2}>{title}</Text><Text style={s.muted}>{selected === version.id ? '已选择 · ' : ''}版本 {version.versionNo}</Text>
      </Pressable>}
      ListEmptyComponent={!loading ? <Text style={s.muted}>{query ? '没有匹配的可用版本，请调整搜索。' : `暂无可用${kind === 'image' ? '图片' : '视频'}。可先导入素材或生成候选。`}</Text> : null}
      ListFooterComponent={hasMore && limit < 1000 ? <TextAction label="加载更多素材" disabled={busy || loading} onPress={() => setLimit(n => n + 100)} /> : null} />
    <View style={s.footer}><Text style={s.muted}>{chosen ? `${chosen.title} · 版本 ${chosen.version.versionNo}` : '尚未选择画面'}</Text><ListAction label={busy ? '正在添加…' : kind === 'image' ? '使用所选图片' : '使用所选视频'} disabled={busy || loading || !chosen} onPress={confirm} /></View>
  </SafeAreaView></Modal>;
}
