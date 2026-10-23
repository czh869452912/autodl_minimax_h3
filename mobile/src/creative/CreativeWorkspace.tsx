import { TextVersionEditor } from './TextVersionEditor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { creativeService, importCreativeImage, exportCreativeVersion, creativeFiles, restoreCreativeImage, restoreCreativeImageFromBackup, migrateCreativeHistory } from './runtime';
import type { AssetVersion, CreativeAsset, CreativeCommand, CreativeProject } from './types';
import { pickImagesFromGallery } from '../native/imagePicker';
import { createId } from '../ids';
import { COLORS } from '../ui/theme';
import { ListAction } from '../ui/ListPageUI';
import { ProjectShots } from './ProjectShots';
import { ProjectPlans } from './ProjectPlans';
import { ProjectActivity } from './ProjectActivityPanel';
import { TextAssetEditor } from './TextAssetEditor';
import { TextVersionPreview } from './TextVersionPreview';
import { VersionComparison } from './VersionComparison';
import { locateCreativeFile,restoreCreativeFileFromBackup } from './runtime';
import { pickCreativeFiles } from './fileImport';
import { CREATIVE_FILE_MIMES,creativeExportTarget } from './fileFormats';
import { VideoPlayer } from '../media/VideoPlayer';

export function CreativeWorkspace({ mode }: { mode: 'projects' | 'assets' }) {
  const router = useRouter();
  const [projects, setProjects] = useState<CreativeProject[]>([]);
  const [covers,setCovers]=useState<Record<string,{version_id:string;relative_path:string|null;state:string|null}>>({});
  const [selected, setSelected] = useState<string>();
  const [projectView, setProjectView] = useState<'brief' | 'shots' | 'assets' | 'plans' | 'activity'>('brief');
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [inbox, setInbox] = useState(false);
  const [trash,setTrash]=useState(false),[assetTitle,setAssetTitle]=useState(''),[assetDescription,setAssetDescription]=useState(''),[assetTags,setAssetTags]=useState('');
  const [busy, setBusy] = useState(false);
  const writeLock = useRef(false);
  const readGeneration = useRef(0);
  const [error, setError] = useState('');
  const [migrationNotice, setMigrationNotice] = useState('');
  const [activeAsset, setActiveAsset] = useState<CreativeAsset>();
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, { status: string; generation: number } | undefined>>({});
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (!activeAsset) return;
      const rows = await Promise.all(versions.map(async v => [v.id, (await creativeService().deliveries(v.id))[0]] as const));
      if (!cancelled) setDeliveries(Object.fromEntries(rows));
    };
    void poll().catch(() => undefined);
    const timer = setInterval(() => { void poll().catch(() => undefined); }, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeAsset, versions]);
  const [links, setLinks] = useState<Array<{ project_id: string; title: string; pinned_version_id: string | null; revision: number }>>([]);
  const current = projects.find(p => p.id === selected);
  const refresh = useCallback(async () => {
    const generation = ++readGeneration.current;
    const service = creativeService();
    const projects = await service.projects(archived);
    const covers=await service.covers();
    const assets = await service.assets({ projectId: mode === 'projects' ? selected : undefined, query, inbox: mode === 'assets' && inbox,trash });
    if (generation !== readGeneration.current) return;
    setProjects(projects); setAssets(assets);setCovers(Object.fromEntries(covers.map(c=>[c.project_id,c])));
  }, [selected, mode, query, archived, inbox,trash]);
  useFocusEffect(useCallback(() => { void refresh().catch(e => setError(String(e.message))); }, [refresh]));
  const run = async (work: () => Promise<unknown>) => {
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy(true); setError('');
    try { await work(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试'); } finally { writeLock.current = false; setBusy(false); }
  };
  const command = (input: CreativeCommand) => creativeService().execute(input, createId());
  const openProject=async(p:CreativeProject)=>{const tab=await creativeService().projectTab(p.id);setProjectView(tab);setSelected(p.id);setTitle(p.title);setBrief(p.brief);};
  const changeProjectView=(tab:typeof projectView)=>{setProjectView(tab);if(selected)void creativeService().saveProjectTab(selected,tab).catch(()=>setError('页签保存失败'));};
  const inspect = async (asset: CreativeAsset) => {
    const description=await creativeService().description(asset.id);setAssetTitle(asset.title);setAssetDescription(description?.description??'');setAssetTags(description?JSON.parse(description.tags_json).join(', '):'');
    for (const version of await creativeService().versions(asset.id)) await creativeFiles().verify(version.id);
    setActiveAsset(asset); setVersions(await creativeService().versions(asset.id)); setLinks(await creativeService().links(asset.id));
  };
  const addImages = () => run(async () => { for (const image of await pickImagesFromGallery(9)) await importCreativeImage(image, mode === 'projects' ? selected : undefined); });
  const action = (label: string, onPress: () => void, secondary = true) => <ListAction label={label} onPress={onPress} secondary={secondary} disabled={busy} />;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.row}><Text accessibilityRole="header" style={styles.heading}>{mode === 'projects' ? '项目' : '创作资产'}</Text>
      {action('任务', () => router.push('/(tabs)/tasks'))}{action('设置', () => router.push('/(tabs)/settings'))}</View>
    <View style={styles.row}>{action('项目', () => router.push('/(tabs)/projects'))}{action('资产库', () => router.push('/(tabs)/assets'))}{action('历史视频', () => router.push('/(tabs)/gallery'))}</View>
    {action('创作草稿', () => router.push('/creative-drafts'))}
    {action('NovelAI 新图片', () => void run(async () => { const result = await command({ name: 'draft.createImage', payload: { projectId: mode === 'projects' ? selected : undefined } }); if (result.status === 'completed') router.push({ pathname: '/image-draft/[id]', params: { id: result.value.draftId } }); }), false)}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {mode === 'projects' && selected && !activeAsset ? <View style={styles.row}>{action('简报', () => changeProjectView('brief'))}{action('镜头', () => changeProjectView('shots'))}{action('素材', () => changeProjectView('assets'))}</View> : null}
    {mode === 'projects' && !activeAsset ? <>
      <View style={styles.row}>{action(archived ? '查看进行中项目' : '查看归档项目', () => { setArchived(!archived); setSelected(undefined); })}{selected ? action('全部项目', () => { setSelected(undefined); setTitle(''); setBrief(''); }) : null}</View>
      {!selected ? projects.map(p => <Pressable accessibilityRole="button" accessibilityLabel={`打开项目 ${p.title}`} key={p.id} style={styles.card} onPress={() => void run(()=>openProject(p))}>{covers[p.id]?.state==='AVAILABLE'&&covers[p.id]?.relative_path?<Image accessibilityLabel={`${p.title} 封面`} source={{uri:`${FileSystem.documentDirectory}${covers[p.id].relative_path}`}} style={{height:140,width:'100%'}} resizeMode="cover"/>:null}<Text style={styles.title}>{p.title}</Text><Text style={styles.body} numberOfLines={3}>{p.brief || '尚未填写创作简报'}</Text></Pressable>) : null}
      {!projects.length ? <Text style={styles.body}>创建项目，将创作简报与素材组织在一起。</Text> : null}
      {!selected || projectView === 'brief' ? <View style={styles.card}><Text style={styles.title}>{selected ? '项目简报' : '新建项目'}</Text>
        <TextInput accessibilityLabel="项目名称" placeholder="项目名称" value={title} onChangeText={setTitle} style={styles.input} />
        <TextInput accessibilityLabel="创作简报" placeholder="目标、角色、场景、风格和交付要求" multiline value={brief} onChangeText={setBrief} style={[styles.input, styles.multiline]} />
        {action(selected ? '保存简报' : '创建项目', () => void run(async () => {
          if (current) await command({ name: 'project.update', payload: { id: current.id, title, brief, expectedRevision: current.revision } });
          else { await command({ name: 'project.create', payload: { title, brief } }); setTitle(''); setBrief(''); }
        }), false)}
        {current ? action(current.archivedAt ? '恢复项目' : '归档项目', () => void run(async () => { await command({ name: 'project.archive', payload: { id: current.id, archived: !current.archivedAt, expectedRevision: current.revision } }); setSelected(undefined); setTitle(''); setBrief(''); })) : null}
      </View> : null}
      {current&&covers[current.id]?action('移除项目封面',()=>void run(()=>command({name:'project.setCover',payload:{id:current.id,expectedRevision:current.revision,versionId:null}}))):null}
    </> : null}
    {mode === 'projects' && selected && projectView === 'shots' && !activeAsset ? <ProjectShots key={selected} projectId={selected} archived={Boolean(current?.archivedAt)} /> : null}
    {mode === 'projects' && selected && !activeAsset ? action('选图与视频计划',()=>changeProjectView('plans')) : null}
    {mode === 'projects' && selected && projectView === 'plans' && !activeAsset ? <ProjectPlans key={selected} projectId={selected} archived={Boolean(current?.archivedAt)} /> : null}
    {mode === 'projects' && selected && !activeAsset ? action('项目活动与任务',()=>changeProjectView('activity')) : null}
    {mode === 'projects' && selected && projectView === 'activity' && !activeAsset ? <ProjectActivity key={selected} projectId={selected} /> : null}
    {activeAsset ? <View style={styles.card}>
      {action('返回素材列表', () => setActiveAsset(undefined))}<Text style={styles.title}>{activeAsset.title}</Text>
      {trash ? action('从回收站恢复',()=>void run(async()=>{await command({name:'asset.restore',payload:{id:activeAsset.id,expectedRevision:activeAsset.revision}});setActiveAsset(undefined);})) : <>
        <TextInput accessibilityLabel="资产名称" value={assetTitle} onChangeText={setAssetTitle} style={styles.input} />
        <TextInput accessibilityLabel="资产说明" placeholder="创作说明" multiline value={assetDescription} onChangeText={setAssetDescription} style={styles.input} />
        <TextInput accessibilityLabel="资产标签" placeholder="标签，用逗号分隔" value={assetTags} onChangeText={setAssetTags} style={styles.input} />
        {action('保存说明与标签',()=>void run(async()=>{await command({name:'asset.describe',payload:{id:activeAsset.id,expectedRevision:activeAsset.revision,title:assetTitle,description:assetDescription,tags:assetTags.split(/[,，]/).map(s=>s.trim()).filter(Boolean)}});setActiveAsset({...activeAsset,title:assetTitle,revision:activeAsset.revision+1});}))}
        {action('移入回收站',()=>Alert.alert('移入回收站','仍被项目、镜头或草稿引用的资产会阻止此操作。回收站保留文件，可恢复。',[{text:'取消',style:'cancel'},{text:'移入',onPress:()=>void run(async()=>{await command({name:'asset.trash',payload:{id:activeAsset.id,expectedRevision:activeAsset.revision}});setActiveAsset(undefined);})}]))}
      </>}
      <VersionComparison key={activeAsset.id} versions={versions}/>
      {versions.map(v => <View key={v.id} style={styles.card}>
        <Text style={styles.body}>版本 {v.versionNo} · {activeAsset.currentVersionId === v.id ? '默认版本' : '候选版本'} · {v.state === 'AVAILABLE' ? '本地可用' : '文件待恢复'}</Text>
        {v.relativePath && v.mime?.startsWith('image/') ? <Image accessibilityLabel={`版本 ${v.versionNo} 预览`} source={{ uri: `${FileSystem.documentDirectory}${v.relativePath}` }} style={styles.preview} resizeMode="contain" /> : null}
        {v.state === 'AVAILABLE' && v.relativePath && v.mime?.startsWith('video/') ? <VideoPlayer source={`${FileSystem.documentDirectory}${v.relativePath}`} /> : null}
        {v.state==='AVAILABLE'&&['text/plain','text/markdown','application/json'].includes(v.mime??'')?<TextVersionPreview version={v}/>:null}
        {!trash&&v.state==='AVAILABLE'&&['text/plain','text/markdown'].includes(v.mime??'')?<TextVersionEditor key={`${v.id}:${activeAsset.revision}`} asset={activeAsset} version={v} onSaved={async()=>{setActiveAsset(undefined);await refresh();}}/>:null}
        {v.state === 'AVAILABLE' && (CREATIVE_FILE_MIMES as readonly string[]).includes(v.mime ?? '') ? action(creativeExportTarget(v.mime??'')==='system-gallery'?'保存到系统相册':'保存到下载文件夹', () => void run(() => exportCreativeVersion(v.id))) : null}
        {v.state !== 'AVAILABLE' && activeAsset.kind === 'image' ? <><Text style={styles.body}>版本记录仍保留。请重新选择原始图片；内容不同会拒绝替换。</Text>{action('重新定位原图', () => void run(async () => { const [image] = await pickImagesFromGallery(1); if (image) { await restoreCreativeImage(v.id, image); await inspect(activeAsset); } }))}</> : null}
        {v.state !== 'AVAILABLE' && activeAsset.kind === 'image' ? action('从文件备份找回', () => void run(async () => { await restoreCreativeImageFromBackup(v.id); await inspect(activeAsset); })) : null}
        {deliveries[v.id] ? <Text style={styles.body}>{({ QUEUED: '等待保存', PUBLISHING: '正在保存', EXPORTED: '文件已保存', FAILED: '保存失败，请检查源文件', DELIVERY_UNKNOWN: '保存结果不确定，请先检查相册或下载文件夹', QUARANTINED: '恢复的保存操作已隔离，未重新执行' } as Record<string, string>)[deliveries[v.id]!.status]}</Text> : null}
        {deliveries[v.id] && ['EXPORTED','FAILED','DELIVERY_UNKNOWN','QUARANTINED'].includes(deliveries[v.id]!.status) ? action('另存一份', () => Alert.alert('另存一份文件', '这会发起新的保存操作，目标文件夹中可能出现重复文件。', [{ text: '取消', style: 'cancel' }, { text: '继续保存', onPress: () => void run(() => exportCreativeVersion(v.id, deliveries[v.id]!.generation + 1)) }])) : null}
        {v.state === 'AVAILABLE' ? action('设为默认版本', () => void run(async () => { await command({ name: 'asset.setDefaultVersion', payload: { id: activeAsset.id, versionId: v.id, expectedRevision: activeAsset.revision } }); const updated = (await creativeService().assets()).find(a => a.id === activeAsset.id); if (updated) await inspect(updated); })) : null}
        {typeof v.recipe.jobId === 'string' ? <Text style={styles.body}>来源任务：{v.recipe.jobId}</Text> : null}
        {Array.isArray(v.recipe.notices) ? v.recipe.notices.map((notice,i)=><Text key={i} style={styles.body}>{String(notice)}</Text>) : null}
        {activeAsset.kind === 'image' && v.recipe.input ? action('恢复参数并继续出图', () => void run(async () => { const result=await command({name:'draft.createImage',payload:{fromVersionId:v.id,projectId:mode==='projects'?selected:undefined}}); if(result.status==='completed')router.push({pathname:'/image-draft/[id]',params:{id:result.value.draftId}}); })) : null}
        {activeAsset.kind === 'image' && !v.recipe.input ? <Text style={styles.body}>没有可完整恢复的生成参数；保留原文件，不猜测原始提示词。</Text> : null}
        {v.state !== 'AVAILABLE' && activeAsset.kind !== 'image' ? <><Text style={styles.body}>原件尚不可用。版本与来源保留，只接受与已记录哈希相同的文件。</Text>{action('重新定位原文件',()=>void run(async()=>{await locateCreativeFile(v.id);await inspect(activeAsset);}))}{action('从备份恢复原文件',()=>void run(async()=>{await restoreCreativeFileFromBackup(v.id);await inspect(activeAsset);}))}</> : null}
        {v.state === 'AVAILABLE' && activeAsset.kind === 'image' ? action('从此版本创建视频草稿', () => void run(async () => { const result = await command({ name: 'draft.createVideo', payload: { versionId: v.id, ...(mode === 'projects' && selected ? { projectId: selected } : {}) } }); if (result.status === 'completed') router.push({ pathname: '/creative-draft/[id]', params: { id: result.value.draftId } }); })) : null}
        {projects.filter(p => !p.archivedAt && !links.some(l => l.project_id === p.id)).map(p => <View key={p.id}>{action(`加入 ${p.title}（固定此版本）`, () => void run(async () => { await command({ name: 'asset.linkToProject', payload: { assetId: activeAsset.id, projectId: p.id, versionId: v.id } }); await inspect(activeAsset); }))}</View>)}
        {links.filter(l => l.pinned_version_id !== v.id).map(l => <View key={l.project_id}>{action(`将 ${l.title} 固定到此版本`, () => void run(async () => { await command({ name: 'asset.pinProjectVersion', payload: { assetId: activeAsset.id, projectId: l.project_id, expectedRevision: l.revision, versionId: v.id } }); await inspect(activeAsset); }))}</View>)}
        {activeAsset.kind==='image'&&v.state==='AVAILABLE'?links.map(l=>{const p=projects.find(p=>p.id===l.project_id);return p&&!p.archivedAt?<View key={`cover-${p.id}`}>{action(`设为 ${p.title} 封面`,()=>void run(async()=>{await creativeFiles().verify(v.id);await command({name:'project.setCover',payload:{id:p.id,expectedRevision:p.revision,versionId:v.id}});} ))}</View>:null;}):null}
      </View>)}
      <Text style={styles.title}>使用位置</Text>
      {links.map(link => <View key={link.project_id}><Text style={styles.body}>{link.title} · {link.pinned_version_id ? '固定版本' : '跟随默认'}</Text>{action(`从 ${link.title} 移出`, () => void run(async () => { await command({ name: 'asset.unlinkFromProject', payload: { assetId: activeAsset.id, projectId: link.project_id, expectedRevision: link.revision } }); await inspect(activeAsset); }))}</View>)}
      {!links.length ? <Text style={styles.body}>未加入项目，保存在收件箱。</Text> : null}
      {links.filter(l => l.pinned_version_id).map(l => <View key={l.project_id}>{action(`让 ${l.title} 跟随默认版本`, () => void run(async () => { await command({ name: 'asset.pinProjectVersion', payload: { assetId: activeAsset.id, projectId: l.project_id, expectedRevision: l.revision, versionId: null } }); await inspect(activeAsset); }))}</View>)}
    </View> : mode === 'assets' || (selected && projectView === 'assets') ? <>
      <View style={styles.row}>{action('导入图片', () => void addImages(), false)}{mode === 'assets' ? action(inbox ? '全部资产' : '收件箱', () => setInbox(!inbox)) : null}</View>
      {action('导入视频、音频或文档（最多 100MB）',()=>void run(()=>pickCreativeFiles(mode==='projects'?selected:undefined)))}
      <TextAssetEditor projectId={mode==='projects'?selected:undefined} onSaved={refresh}/>
      <TextInput accessibilityLabel="搜索资产" placeholder="搜索资产名称" value={query} onChangeText={setQuery} style={styles.input} />
      {mode==='assets'?action(trash?'返回全部资产':'回收站',()=>{setTrash(!trash);setInbox(false);}):null}
      {!assets.length ? <Text style={styles.body}>还没有素材。导入图片后可加入多个项目，文件只保留一份。</Text> : null}
      {assets.map(a => <Pressable accessibilityRole="button" accessibilityLabel={`打开资产 ${a.title}`} key={a.id} style={styles.card} onPress={() => void run(() => inspect(a))}><Text style={styles.title}>{a.title}</Text><Text style={styles.body}>{a.kind} · {a.currentVersionId ? '已选默认版本' : '待选定版本'}</Text></Pressable>)}
      <Text style={styles.body}>最近 100 项；已有视频仍可从“历史视频”访问。</Text>
      {action('迁入历史作品（可中断）', () => void run(async () => { const result = await migrateCreativeHistory(); setMigrationNotice(`本批迁入或更新 ${result.imported} 项。${result.pending ? '还有记录，点击继续迁入。' : '已追平当前历史记录。'}`); }))}
      {migrationNotice ? <Text accessibilityLiveRegion="polite" style={styles.body}>{migrationNotice}</Text> : null}
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
