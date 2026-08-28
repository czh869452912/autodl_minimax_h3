import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { openDatabaseSync } from 'expo-sqlite';
import { GalleryCard } from '../../src/media/GalleryCard';
import { createSqliteMediaStore } from '../../src/media/repository';
import { openNativeVideo } from '../../src/native/media';
import type { MediaAsset } from '../../src/media/types';

const database = openDatabaseSync('autodl-h3.db');
const mediaStore = createSqliteMediaStore(database);

export default function GalleryScreen() {
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const loadAssets = useCallback(async () => {
    setLoading(true);
    try { setAssets(await mediaStore.list({ query })); } finally { setLoading(false); }
  }, [query]);
  useEffect(() => { void loadAssets(); }, [loadAssets]);
  const items = useMemo(() => assets, [assets]);
  const openAsset = (asset: MediaAsset) => {
    if (!openNativeVideo(asset.localPath || asset.sourceUrl)) setSelected(asset);
  };
  return <View style={styles.container}>
    <Text style={styles.title}>作品画廊 Gallery</Text>
    <Text style={styles.subtitle}>浏览、播放与管理所有由 MiniMax H3 渲染生成的视频。</Text>
    <TextInput value={query} onChangeText={setQuery} placeholder="搜索 Prompt 或任务 ID..." placeholderTextColor="#64748b" style={styles.input} />
    <FlatList data={items} numColumns={2} keyExtractor={(item) => item.id} columnWrapperStyle={styles.row} contentContainerStyle={styles.list} renderItem={({ item }) => <GalleryCard asset={item} onPress={() => openAsset(item)} />} ListEmptyComponent={<Text style={styles.empty}>{loading ? '正在加载视频作品…' : '暂无视频作品'}</Text>} />
    {selected && <Text accessibilityLiveRegion="polite" style={styles.selection}>已选择：{selected.title}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', padding: 20, paddingTop: 60 },
  title: { color: '#f8fafc', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#94a3b8', marginTop: 6, marginBottom: 20 },
  input: { backgroundColor: '#0f172a', color: '#e2e8f0', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
  list: { gap: 14, paddingBottom: 30 },
  row: { gap: 14 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 64 },
  selection: { color: '#818cf8', marginTop: 8 },
});
