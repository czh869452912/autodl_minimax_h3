import { useCallback, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { creativeService, importCreativeImage } from './runtime';
import type { AssetVersion, CreativeAsset, CreativeCommand, CreativeProject } from './types';
import { pickImagesFromGallery } from '../native/imagePicker';
import { createId } from '../ids';
import { COLORS } from '../ui/theme';
import { ListAction } from '../ui/ListPageUI';

export function CreativeWorkspace({ mode }: { mode: 'projects' | 'assets' }) {
  const router = useRouter();
  const [projects, setProjects] = useState<CreativeProject[]>([]);
  const [selected, setSelected] = useState<string>();
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [inbox, setInbox] = useState(false);
  const [busy, setBusy] = useState(false);
  const writeLock = useRef(false);
  const readGeneration = useRef(0);
  const [error, setError] = useState('');
  const [activeAsset, setActiveAsset] = useState<CreativeAsset>();
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [links, setLinks] = useState<Array<{ project_id: string; title: string; pinned_version_id: string | null; revision: number }>>([]);
  const current = projects.find(p => p.id === selected);
  const refresh = useCallback(async () => {
    const generation = ++readGeneration.current;
    const service = creativeService();
    const projects = await service.projects(archived);
    const assets = await service.assets({ projectId: mode === 'projects' ? selected : undefined, query, inbox: mode === 'assets' && inbox });
    if (generation !== readGeneration.current) return;
    setProjects(projects); setAssets(assets);
  }, [selected, mode, query, archived, inbox]);
  useFocusEffect(useCallback(() => { void refresh().catch(e => setError(String(e.message))); }, [refresh]));
  const run = async (work: () => Promise<unknown>) => {
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy(true); setError('');
    try { await work(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试'); } finally { writeLock.current = false; setBusy(false); }
  };
  const command = (input: CreativeCommand) => creativeService().execute(input, createId());
  const inspect = async (asset: CreativeAsset) => {
    setActiveAsset(asset); setVersions(await creativeService().versions(asset.id)); setLinks(await creativeService().links(asset.id));
  };
  const addImages = () => run(async () => { for (const image of await pickImagesFromGallery(9)) await importCreativeImage(image, mode === 'projects' ? selected : undefined); });
  const action = (label: string, onPress: () => void, secondary = true) => <ListAction label={label} onPress={onPress} secondary={secondary} disabled={busy} />;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.row}><Text accessibilityRole="header" style={styles.heading}>{mode === 'projects' ? '项目' : '创作资产'}</Text>
      {action('任务', () => router.push('/(tabs)/tasks'))}{action('设置', () => router.push('/(tabs)/settings'))}</View>
    <View style={styles.row}>{action('项目', () => router.push('/(tabs)/projects'))}{action('资产库', () => router.push('/(tabs)/assets'))}{action('历史视频', () => router.push('/(tabs)/gallery'))}</View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {mode === 'projects' && !activeAsset ? <>
      <View style={styles.row}>{action(archived ? '查看进行中项目' : '查看归档项目', () => { setArchived(!archived); setSelected(undefined); })}{selected ? action('全部项目', () => { setSelected(undefined); setTitle(''); setBrief(''); }) : null}</View>
      {!selected ? projects.map(p => <Pressable accessibilityRole="button" accessibilityLabel={`打开项目 ${p.title}`} key={p.id} style={styles.card} onPress={() => { setSelected(p.id); setTitle(p.title); setBrief(p.brief); }}><Text style={styles.title}>{p.title}</Text><Text style={styles.body} numberOfLines={3}>{p.brief || '尚未填写创作简报'}</Text></Pressable>) : null}
      {!projects.length ? <Text style={styles.body}>创建项目，将创作简报与素材组织在一起。</Text> : null}
      <View style={styles.card}><Text style={styles.title}>{selected ? '项目简报' : '新建项目'}</Text>
        <TextInput accessibilityLabel="项目名称" placeholder="项目名称" value={title} onChangeText={setTitle} style={styles.input} />
        <TextInput accessibilityLabel="创作简报" placeholder="目标、角色、场景、风格和交付要求" multiline value={brief} onChangeText={setBrief} style={[styles.input, styles.multiline]} />
        {action(selected ? '保存简报' : '创建项目', () => void run(async () => {
          if (current) await command({ name: 'project.update', payload: { id: current.id, title, brief, expectedRevision: current.revision } });
          else { await command({ name: 'project.create', payload: { title, brief } }); setTitle(''); setBrief(''); }
        }), false)}
        {current ? action(current.archivedAt ? '恢复项目' : '归档项目', () => void run(async () => { await command({ name: 'project.archive', payload: { id: current.id, archived: !current.archivedAt, expectedRevision: current.revision } }); setSelected(undefined); setTitle(''); setBrief(''); })) : null}
      </View>
    </> : null}
    {activeAsset ? <View style={styles.card}>
      {action('返回素材列表', () => setActiveAsset(undefined))}<Text style={styles.title}>{activeAsset.title}</Text>
      {versions.map(v => <View key={v.id} style={styles.card}>
        <Text style={styles.body}>版本 {v.versionNo} · {activeAsset.currentVersionId === v.id ? '默认版本' : '候选版本'} · {v.state === 'AVAILABLE' ? '本地可用' : '文件待恢复'}</Text>
        {v.relativePath && v.mime?.startsWith('image/') ? <Image accessibilityLabel={`版本 ${v.versionNo} 预览`} source={{ uri: `${FileSystem.documentDirectory}${v.relativePath}` }} style={styles.preview} resizeMode="contain" /> : null}
        {v.state === 'AVAILABLE' ? action('设为默认版本', () => void run(async () => { await command({ name: 'asset.setDefaultVersion', payload: { id: activeAsset.id, versionId: v.id, expectedRevision: activeAsset.revision } }); const updated = (await creativeService().assets()).find(a => a.id === activeAsset.id); if (updated) await inspect(updated); })) : null}
        {projects.filter(p => !p.archivedAt && !links.some(l => l.project_id === p.id)).map(p => <View key={p.id}>{action(`加入 ${p.title}（固定此版本）`, () => void run(async () => { await command({ name: 'asset.linkToProject', payload: { assetId: activeAsset.id, projectId: p.id, versionId: v.id } }); await inspect(activeAsset); }))}</View>)}
      </View>)}
      <Text style={styles.title}>使用位置</Text>
      {links.map(link => <View key={link.project_id}><Text style={styles.body}>{link.title} · {link.pinned_version_id ? '固定版本' : '跟随默认'}</Text>{action(`从 ${link.title} 移出`, () => void run(async () => { await command({ name: 'asset.unlinkFromProject', payload: { assetId: activeAsset.id, projectId: link.project_id, expectedRevision: link.revision } }); await inspect(activeAsset); }))}</View>)}
      {!links.length ? <Text style={styles.body}>未加入项目，保存在收件箱。</Text> : null}
    </View> : mode === 'assets' || selected ? <>
      <View style={styles.row}>{action('导入图片', () => void addImages(), false)}{mode === 'assets' ? action(inbox ? '全部资产' : '收件箱', () => setInbox(!inbox)) : null}</View>
      <TextInput accessibilityLabel="搜索资产" placeholder="搜索资产名称" value={query} onChangeText={setQuery} style={styles.input} />
      {!assets.length ? <Text style={styles.body}>还没有素材。导入图片后可加入多个项目，文件只保留一份。</Text> : null}
      {assets.map(a => <Pressable accessibilityRole="button" accessibilityLabel={`打开资产 ${a.title}`} key={a.id} style={styles.card} onPress={() => void run(() => inspect(a))}><Text style={styles.title}>{a.title}</Text><Text style={styles.body}>{a.kind} · {a.currentVersionId ? '已选默认版本' : '待选定版本'}</Text></Pressable>)}
      <Text style={styles.body}>最近 100 项；已有视频仍可从“历史视频”访问。</Text>
    </> : null}
  </ScrollView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background }, content: { padding: 16, gap: 12, paddingBottom: 40 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, heading: { fontSize: 26, color: COLORS.text, fontWeight: '700', flexGrow: 1 },
  card: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 16, borderColor: COLORS.border, borderWidth: 1, gap: 12 },
  title: { fontSize: 18, color: COLORS.text, fontWeight: '600' }, body: { color: COLORS.textMuted, lineHeight: 22 }, error: { color: COLORS.danger },
  input: { borderWidth: 1, borderColor: COLORS.controlBorder, borderRadius: 10, padding: 12, color: COLORS.text, backgroundColor: COLORS.surface, minHeight: 48 }, multiline: { minHeight: 110, textAlignVertical: 'top' }, preview: { width: '100%', height: 280 },
});
