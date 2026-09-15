import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getDatabase } from '../../src/storage/databaseClient';
import { GalleryCard } from '../../src/media/GalleryCard';
import type { MediaAsset, MediaStatus } from '../../src/media/types';
import { createSqliteMediaStore } from '../../src/media/repository';
import { extractPoster } from '../../src/native/media';
import { AppIcon } from '../../src/ui/icons';
import { ListAction, ListEmptyState, ListFilters, listUI } from '../../src/ui/ListPageUI';
import { COLORS, SPACING } from '../../src/ui/theme';
import { resolveLocalVideoSource } from '../../src/tasks/localMedia';

const filters: Array<{ id: 'all' | MediaStatus; label: string }> = [{ id: 'all', label: '全部' }, { id: 'downloaded', label: '已下载' }, { id: 'downloading', label: '准备中' }, { id: 'failed', label: '失败' }];

export default function GalleryScreen() {
  const router = useRouter();
  const [mediaStore] = useState(() => createSqliteMediaStore(getDatabase()));
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [searchRevision, setSearchRevision] = useState(0);
  const [filter, setFilter] = useState<'all' | MediaStatus>('all');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState('');
  const [cursor, setCursor] = useState<{ createdAt: number; id: string }>();
  const [selected, setSelected] = useState<string[]>([]);
  const [removing, setRemoving] = useState(false);
  const generation = useRef(0);
  const paging = useRef(false);
  const reading = useRef(false);
  const navigating = useRef(false);
  const posters = useRef(new Map<string, string>());
  useEffect(() => { const timer = setTimeout(() => { setSearch(query); setSearchRevision(value => value + 1); }, 300); return () => clearTimeout(timer); }, [query]);
  const enrich = useCallback(async (items: MediaAsset[], token: number) => {
    const result: MediaAsset[] = [];
    for (const source of items) {
      if (token !== generation.current) break;
      const localPath = await resolveLocalVideoSource({ task: { id: source.taskId, localUri: undefined }, asset: source });
      let asset = { ...source, localPath, posterPath: source.posterPath?.includes('/posters/sw-v3-') ? source.posterPath : undefined };
      if (source.status === 'downloaded' && !localPath) asset.status = source.sourceUrl ? 'queued' : 'failed';
      // Never rewrite the durable download state merely by searching the gallery.
      if (localPath && !asset.posterPath) {
        const key = `${asset.id}:${localPath}`;
        try {
          const poster = posters.current.get(key) ?? await extractPoster(localPath, asset.id);
          if (poster) { posters.current.set(key, poster); asset.posterPath = poster; await mediaStore.updatePoster?.(asset.id, localPath, poster); }
        } catch { /* a poster is optional; playback remains available */ }
      }
      result.push(asset);
    }
    return result;
  }, [mediaStore]);
  const load = useCallback(async () => {
    const token = ++generation.current;
    reading.current = true; paging.current = false;
    setLoading(true); setLoadingMore(false); setError(''); setPageError('');
    try {
      const options = { limit: 40, query: search, kind: 'video' as const, status: filter === 'all' ? undefined : filter };
      const page = await mediaStore.listPage?.(options) ?? { items: await mediaStore.list(options), nextCursor: undefined };
      if (token !== generation.current) return;
      setAssets(page.items); setCursor(page.nextCursor);
      const items = await enrich(page.items, token);
      if (token === generation.current) setAssets(items);
    } catch { if (token === generation.current) setError('作品读取失败，请重试'); }
    finally { if (token === generation.current) { reading.current = false; setLoading(false); } }
  }, [search, searchRevision, filter, enrich]);
  const loadMore = async () => {
    if (!cursor || paging.current || reading.current || !mediaStore.listPage) return;
    paging.current = true; setLoadingMore(true); setPageError('');
    const token = generation.current;
    try {
      const page = await mediaStore.listPage({ limit: 40, cursor, query: search, kind: 'video', status: filter === 'all' ? undefined : filter });
      const items = await enrich(page.items, token);
      if (token !== generation.current) return;
      setAssets(current => [...current, ...items.filter(item => !current.some(old => old.id === item.id))]); setCursor(page.nextCursor);
    } catch { if (token === generation.current) setPageError('加载更多失败，点击重试'); }
    finally { if (token === generation.current) { paging.current = false; setLoadingMore(false); } }
  };
  useFocusEffect(useCallback(() => { navigating.current = false; void load(); return () => { generation.current++; }; }, [load]));
  const changeQuery = (value: string) => { if (value === query) return; generation.current++; setQuery(value); setSelected([]); };
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const removeSelected = () => Alert.alert('删除作品', `删除 ${selected.length} 个应用内作品和私有副本，系统相册视频会保留。此操作无法撤销。`, [
    { text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: async () => {
      if (removing) return;
      generation.current++; setRemoving(true);
      try { for (const id of selected) await mediaStore.remove(id); setSelected([]); await load(); }
      catch { setError('部分作品未能删除，请刷新后重试'); }
      finally { setRemoving(false); }
    } },
  ]);
  const openAsset = (asset: MediaAsset) => { if (navigating.current) return; navigating.current = true; router.push({ pathname: '/video/[id]', params: { id: asset.id } }); };
  const clearFilters = () => { generation.current++; changeQuery(''); setFilter('all'); setSelected([]); setPageError(''); };
  return <View style={styles.container}>
    <Text style={styles.title}>结果</Text><Text style={styles.subtitle}>浏览与播放作品，长按可选择多个作品。</Text>
    {selected.length > 0 ? <View style={styles.selectionPanel}>
      <View style={styles.selectionHeading}><Text accessibilityLiveRegion="polite" style={styles.selectionTitle}>已选择 {selected.length} 项</Text><ListAction secondary label="取消选择" onPress={() => setSelected([])} /></View>
      <View style={styles.selectionActions}><ListAction secondary label="选择已加载作品" onPress={() => setSelected(assets.map(item => item.id))} /><Pressable accessibilityRole="button" accessibilityState={{ disabled: removing, busy: removing }} disabled={removing} onPress={removeSelected} style={({ pressed }) => [styles.deleteAll, pressed && listUI.pressed, removing && listUI.disabled]}><AppIcon name="delete" size={18} color={COLORS.danger} /><Text style={styles.deleteText}>{removing ? '正在删除…' : `删除 ${selected.length}`}</Text></Pressable></View>
    </View> : null}
    <View style={styles.search}><AppIcon name="search" size={21} color={COLORS.textSubtle} /><TextInput accessibilityLabel="搜索作品" value={query} onChangeText={changeQuery} placeholder="搜索 Prompt 或任务 ID..." placeholderTextColor={COLORS.textSubtle} style={styles.searchInput} />{query ? <Pressable accessibilityRole="button" accessibilityLabel="清除作品搜索" onPress={() => changeQuery('')} style={({ pressed }) => [styles.clearSearch, pressed && listUI.pressed]}><AppIcon name="close" size={18} color={COLORS.textMuted} /></Pressable> : null}</View>
    <ListFilters label="作品状态" options={filters} value={filter} onChange={value => { if (value === filter) return; generation.current++; setSelected([]); setFilter(value); }} />
    {error ? <View style={listUI.notice}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><ListAction secondary icon="refresh" label="重试读取作品列表" onPress={() => void load()} /></View> : null}
    <FlatList data={assets} numColumns={2} keyExtractor={item => item.id} columnWrapperStyle={styles.row} contentContainerStyle={styles.list} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" refreshing={loading && assets.length > 0} onRefresh={() => void load()} onEndReached={() => { if (!pageError) void loadMore(); }} onEndReachedThreshold={0.6}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.primaryActive} /> : pageError ? <ListAction secondary icon="refresh" label={pageError} onPress={() => void loadMore()} /> : assets.length && !cursor ? <Text style={listUI.footer}>已显示全部作品</Text> : null}
      renderItem={({ item }) => <GalleryCard asset={item} selected={selected.includes(item.id)} onLongPress={() => toggle(item.id)} onPress={() => selected.length ? toggle(item.id) : openAsset(item)} />}
      ListEmptyComponent={error ? null : <ListEmptyState icon={query || filter !== 'all' ? 'search' : 'movie_filter'} loading={loading}
        title={loading ? '正在加载作品' : query || filter !== 'all' ? '没有符合条件的作品' : '还没有视频作品'}
        description={loading ? '正在整理视频与封面，请稍候。' : query || filter !== 'all' ? '试试其他关键词，或清除筛选查看全部作品。' : '生成的视频会汇集在这里，随时浏览、播放与管理。'}
        action={loading ? undefined : query || filter !== 'all' ? { label: '清除筛选', icon: 'refresh', onPress: clearFilters } : { label: '去生成视频', icon: 'movie_filter', onPress: () => router.push('/(tabs)/create') }}
        secondaryAction={!loading && (query || filter !== 'all') ? { label: '去生成视频', icon: 'movie_filter', onPress: () => router.push('/(tabs)/create') } : undefined} />} />
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.xl },
  title: { color: COLORS.text, fontSize: 29, fontWeight: '800' },
  subtitle: { color: COLORS.textMuted, marginTop: 6, marginBottom: SPACING.lg, lineHeight: 20 },
  selectionPanel: { padding: 12, borderRadius: 16, backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: COLORS.border, gap: 8, marginBottom: 16 },
  selectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selectionTitle: { color: COLORS.primaryActive, fontSize: 14, fontWeight: '700' },
  selectionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  deleteAll: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.dangerSoft, borderWidth: 1, borderColor: COLORS.danger },
  deleteText: { color: COLORS.danger, fontSize: 13, fontWeight: '700', lineHeight: 20 },
  errorText: { color: COLORS.danger, fontSize: 13, lineHeight: 20 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 13 },
  searchInput: { flex: 1, minWidth: 0, color: COLORS.text, minHeight: 50, fontSize: 14 },
  clearSearch: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 13, paddingBottom: 130 },
  row: { gap: 13 },
});
