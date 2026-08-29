import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { openDatabaseSync } from 'expo-sqlite';
import { GalleryCard } from '../../src/media/GalleryCard';
import type { MediaAsset, MediaStatus } from '../../src/media/types';
import { createTaskRepository } from '../../src/tasks/repository';
import type { TaskRecord } from '../../src/tasks/types';
import { projectGallery } from '../../src/gallery/presentation';
import { extractPoster } from '../../src/native/media';
import { AppIcon } from '../../src/ui/icons';
import { COLORS, SPACING } from '../../src/ui/theme';

const taskStore = createTaskRepository(openDatabaseSync('autodl-h3.db'));
const filters: Array<{ id: 'all' | MediaStatus; label: string }> = [{ id: 'all', label: '全部' }, { id: 'downloaded', label: '已下载' }, { id: 'downloading', label: '准备中' }, { id: 'failed', label: '失败' }];

export default function GalleryScreen() {
  const router = useRouter();
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState<'all' | MediaStatus>('all'); const [assets, setAssets] = useState<MediaAsset[]>([]); const [loading, setLoading] = useState(true); const [selected, setSelected] = useState<string[]>([]);
  const load = useCallback(async () => { setLoading(true); try { const tasks = await taskStore.list(); const mapped = projectGallery(tasks, { query, status: filter }); const refreshed = await Promise.all(mapped.map(async (asset) => { if (!asset.posterPath) { try { const poster = await extractPoster(asset.localPath || asset.sourceUrl, asset.id); if (poster) { const task = tasks.find((item) => item.id === asset.id); if (task) await taskStore.upsert({ ...task, thumbnailUrl: poster, updatedAt: Date.now() }); return { ...asset, posterPath: poster }; } } catch {} } return asset; })); setAssets(refreshed); } finally { setLoading(false); } }, [filter, query]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const removeSelected = () => Alert.alert('删除作品', `确定删除 ${selected.length} 个本地作品吗？`, [{ text: '取消' }, { text: '删除', style: 'destructive', onPress: async () => { for (const id of selected) await taskStore.remove(id); setSelected([]); void load(); } }]);
  const openAsset = (asset: MediaAsset) => router.push({ pathname: '/video/[id]', params: { id: asset.id } });
  return <View style={styles.container}><View style={styles.heading}><View><Text style={styles.title}>作品画廊 Gallery</Text><Text style={styles.subtitle}>浏览、播放与管理所有由 MiniMax H3 渲染生成的视频。</Text></View>{selected.length > 0 && <Pressable onPress={removeSelected} style={styles.deleteAll}><AppIcon name="delete" size={19} color={COLORS.danger} /><Text style={styles.deleteText}>删除 {selected.length}</Text></Pressable>}</View><View style={styles.search}><AppIcon name="search" size={21} color={COLORS.textSubtle} /><TextInput value={query} onChangeText={setQuery} placeholder="搜索 Prompt 或任务 ID..." placeholderTextColor={COLORS.textSubtle} style={styles.searchInput} /></View><View style={styles.filters}>{filters.map((item) => <Pressable key={item.id} onPress={() => setFilter(item.id)} style={[styles.filter, filter === item.id && styles.filterActive]}><Text style={[styles.filterText, filter === item.id && styles.filterTextActive]}>{item.label}</Text></Pressable>)}</View><FlatList data={assets} numColumns={2} keyExtractor={(item) => item.id} columnWrapperStyle={styles.row} contentContainerStyle={styles.list} renderItem={({ item }) => <GalleryCard asset={item} selected={selected.includes(item.id)} onLongPress={() => toggle(item.id)} onPress={() => selected.length ? toggle(item.id) : openAsset(item)} />} ListEmptyComponent={<Text style={styles.empty}>{loading ? '正在加载视频作品…' : '暂无视频作品'}</Text>} /></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.xl }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, title: { color: COLORS.text, fontSize: 29, fontWeight: '800' }, subtitle: { color: COLORS.textMuted, marginTop: 6, marginBottom: SPACING.lg, lineHeight: 20 }, deleteAll: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 9, backgroundColor: '#7f1d1d33' }, deleteText: { color: COLORS.danger, fontSize: 12, fontWeight: '700' }, search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 13 }, searchInput: { flex: 1, color: COLORS.text, height: 50, fontSize: 14 }, filters: { flexDirection: 'row', gap: 8, marginVertical: 15 }, filter: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, filterActive: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primaryActive }, filterText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' }, filterTextActive: { color: '#c7d2fe' }, list: { gap: 13, paddingBottom: 130 }, row: { gap: 13 }, empty: { color: COLORS.textSubtle, textAlign: 'center', marginTop: 64 } });
