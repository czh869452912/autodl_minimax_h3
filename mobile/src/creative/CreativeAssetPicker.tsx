import { useEffect, useRef, useState } from 'react';
import { Image, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { creativeFiles, creativeService } from './runtime';
import type { AssetVersion } from './types';
import { ListAction } from '../ui/ListPageUI';
import { creativeUI as s } from './creativeUI';

export function CreativeAssetPicker({ kind, projectId, onChoose, onClose }: { kind: 'image' | 'video'; projectId?: string; onChoose: (version: AssetVersion) => Promise<void>; onClose: () => void }) {
  const [items, setItems] = useState<Array<{ title: string; version: AssetVersion }>>([]);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(!projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(100), [hasMore, setHasMore] = useState(false);
  useEffect(() => setLimit(100), [kind, projectId, all, query]);
  const [loading, setLoading] = useState(true);
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
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}><SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <View style={s.row}><Text style={s.heading}>{kind === 'image' ? '选择图片' : '选择视频'}</Text><ListAction label="取消" secondary disabled={busy} onPress={onClose} /></View>
    <TextInput accessibilityLabel="搜索素材" placeholder="搜索素材名称" value={query} editable={!busy} onChangeText={setQuery} style={s.input} />
    {projectId ? <ListAction label={all ? '仅看本项目' : '从全部素材选择'} secondary disabled={busy} onPress={() => setAll(!all)} /> : null}
    {loading ? <Text style={s.muted}>正在读取素材…</Text> : !items.length ? <Text style={s.muted}>{query ? '没有匹配的可用版本，请调整搜索。' : `暂无可用${kind === 'image' ? '图片' : '视频'}。可先导入素材或生成候选。`}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {items.map(({ title, version }) => <View key={version.id} style={s.card}>
      {version.relativePath && kind === 'image' ? <Image accessibilityLabel={title} source={{ uri: `${FileSystem.documentDirectory}${version.relativePath}` }} style={s.preview} resizeMode="contain" /> : null}
      <Text style={s.body}>{title} · 版本 {version.versionNo}</Text>
      <ListAction label={`使用 ${title} · 版本 ${version.versionNo}`} disabled={busy} onPress={() => { if (lock.current) return; lock.current = true; setBusy(true); void creativeFiles().verify(version.id).then(() => onChoose(version)).then(onClose).catch(e => setError(e instanceof Error ? e.message : '选材失败')).finally(() => { lock.current = false; setBusy(false); }); }} />
    </View>)}
    {hasMore && limit < 1000 ? <ListAction label="加载更多素材" secondary disabled={busy || loading} onPress={() => setLimit(n => n + 100)} /> : null}
  </ScrollView></SafeAreaView></Modal>;
}
