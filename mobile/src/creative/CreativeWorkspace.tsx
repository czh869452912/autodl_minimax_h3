import { RecordRow } from '../ui/RecordRow';
import { KeyboardSurface, KeyboardAwareScrollView as ScrollView } from '../ui/KeyboardSurface';
import { creativeError } from './creativeError';
import { useUnsavedChanges } from './useUnsavedChanges';
import { ProjectOverview } from './ProjectOverview';
import { AssetTile } from './AssetTile';
import { ListFilters } from '../ui/ListPageUI';
import {PdfVersionPreview} from './PdfVersionPreview';
import { AudioVersionPreview } from './AudioVersionPreview';
import { TextVersionEditor } from './TextVersionEditor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { MediaPreview } from './MediaPreview';
import { SettingRow, TextAction } from './WorkbenchUI';
import { ImageProcessingSheet } from './ImageProcessingSheet';
import {ImageMetadataPanel} from './ImageMetadataPanel';

export function CreativeWorkspace({ mode, projectId, assetId, initialTab, initialVersionId, initialTrash = false }: { mode: 'projects' | 'assets'; projectId?: string; assetId?: string; initialTab?: string; initialVersionId?: string; initialTrash?: boolean }) {
  const router = useRouter();
  const [shotEditor, setShotEditor] = useState({ dirty: false, busy: false });
  const [projects, setProjects] = useState<CreativeProject[]>([]);
  const [covers,setCovers]=useState<Record<string,{version_id:string;relative_path:string|null;state:string|null}>>({});
  const [selected, setSelected] = useState<string | undefined>(projectId);
  const [projectView, setProjectView] = useState<'brief' | 'shots' | 'assets' | 'plans' | 'activity'>(initialTab === 'shots' || initialTab === 'plans' || initialTab === 'activity' || initialTab === 'assets' || initialTab === 'brief' ? initialTab : 'shots');
  const [assetLimit, setAssetLimit] = useState(100);
  const [importOpen,setImportOpen]=useState(false);
  const [comparing, setComparing] = useState(false),[processing,setProcessing]=useState(false);
  useEffect(() => setComparing(false), [assetId]);
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [inbox, setInbox] = useState(false);
  const [editingBrief, setEditingBrief] = useState(false), [creating, setCreating] = useState(false), [manage, setManage] = useState(false), [metadata, setMetadata] = useState(false), [versionId, setVersionId] = useState<string | undefined>(initialVersionId), [projectActions, setProjectActions] = useState(false), [projectQuery, setProjectQuery] = useState(''), [kind, setKind] = useState('all');
  const [trash,setTrash]=useState(initialTrash),[assetTitle,setAssetTitle]=useState(''),[assetDescription,setAssetDescription]=useState(''),[assetTags,setAssetTags]=useState('');
  const [metadataBaseline, setMetadataBaseline] = useState('');
  useEffect(() => setAssetLimit(100), [selected, query, inbox, trash, kind]);
  const [busy, setBusy] = useState(false);
  const writeLock = useRef(false);
  const readGeneration = useRef(0);
  const [error, setError] = useState('');
  const [migrationNotice, setMigrationNotice] = useState('');
  const [activeAsset, setActiveAsset] = useState<CreativeAsset>();
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, { status: string; generation: number } | undefined>>({});
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const poll = async () => {
      if (!activeAsset) return;
      const rows = await Promise.all(versions.map(async v => [v.id, (await creativeService().deliveries(v.id))[0]] as const));
      if (!cancelled) setDeliveries(Object.fromEntries(rows));
    };
    void poll().catch(() => undefined);
    const timer = setInterval(() => { void poll().catch(() => undefined); }, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeAsset, versions]));
  const [links, setLinks] = useState<Array<{ project_id: string; title: string; pinned_version_id: string | null; revision: number }>>([]);
  const current = projects.find(p => p.id === selected);
  const briefDirty = creating ? Boolean(title || brief) : editingBrief && Boolean(current) && (title !== current?.title || brief !== current?.brief);
  const metadataDirty = Boolean(activeAsset && metadataBaseline) && JSON.stringify([assetTitle, assetDescription, assetTags]) !== metadataBaseline;
  const metadataDirtyRef = useRef(metadataDirty); metadataDirtyRef.current = metadataDirty;
  const confirmLeave = useUnsavedChanges(briefDirty || metadataDirty || shotEditor.dirty, shotEditor.busy || (busy && (briefDirty || metadataDirty)));
  const discardBrief = () => { setEditingBrief(false); setCreating(false); setTitle(current?.title ?? ''); setBrief(current?.brief ?? ''); };
  const refresh = useCallback(async () => {
    const generation = ++readGeneration.current;
    const service = creativeService();
    const projects = await service.projects(archived);
    if (projectId && !projects.some(p => p.id === projectId)) { const p = await service.project(projectId); if (p) projects.push(p); else setError('项目不存在或已移除'); }
    const covers=await service.covers();
    const assets = await service.assets({ projectId: mode === 'projects' ? selected : undefined, query, inbox: mode === 'assets' && inbox,trash, kind, limit: assetLimit });
    if (generation !== readGeneration.current) return;
    setProjects(projects); setAssets(assets);setCovers(Object.fromEntries(covers.map(c=>[c.project_id,c])));
  }, [selected, mode, query, archived, inbox,trash, projectId, kind, assetLimit]);
  useFocusEffect(useCallback(() => { void refresh().catch(e => setError(String(e.message))); }, [refresh]));
  const run = async (work: () => Promise<unknown>) => {
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy(true); setError('');
    try { await work(); await refresh(); } catch (e) { setError(creativeError(e, '操作失败，请重试')); } finally { writeLock.current = false; setBusy(false); }
  };
  const command = (input: CreativeCommand) => creativeService().execute(input, createId());
  const openProject=async(p:CreativeProject)=>{router.push({pathname:'/creative-project/[id]',params:{id:p.id}});};
  const changeProjectView=(tab:typeof projectView)=>{ if (tab === projectView) return; confirmLeave(() => { discardBrief(); setProjectView(tab); if(selected)void creativeService().saveProjectTab(selected,tab).catch(()=>setError('页签保存失败')); }); };
  const inspect = useCallback(async (asset: CreativeAsset, isActive: () => boolean = () => true) => {
    const service = creativeService();
    const description = await service.description(asset.id);
    for (const version of await service.versions(asset.id)) await creativeFiles().verify(version.id);
    const [rows, links, trashed] = await Promise.all([service.versions(asset.id), service.links(asset.id), service.isTrashed(asset.id)]);
    if (!isActive()) return;
    setAssetTitle(asset.title); setAssetDescription(description?.description ?? '');
    const tags = description ? JSON.parse(description.tags_json).join(', ') : '';
    setAssetTags(tags); setMetadataBaseline(JSON.stringify([asset.title, description?.description ?? '', tags]));
    setActiveAsset(asset); setVersions(rows); setLinks(links); setTrash(trashed);
  }, []);
  useEffect(() => { if (current && !editingBrief) { setTitle(current.title); setBrief(current.brief); } }, [current?.id, current?.revision, editingBrief]);
  useEffect(() => { setVersionId(initialVersionId); }, [initialVersionId]);
  useFocusEffect(useCallback(() => {
    if (!assetId || metadataDirtyRef.current) return;
    let active = true;
    void creativeService().asset(assetId).then(a => { if (active && a) return inspect(a, () => active); if (active) setError('素材不存在'); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [assetId, inspect]));
  const visibleVersion = versions.find(v => v.id === versionId) ?? versions.find(v => v.id === activeAsset?.currentVersionId) ?? versions[0];
  const visibleAssets = assets.filter(a => kind === 'all' || (kind === 'document' ? !['image','video'].includes(a.kind) : a.kind === kind));
  const back = () => router.canGoBack() ? router.back() : router.replace(mode === 'projects' ? '/(tabs)/projects' : '/(tabs)/assets');
  const revealImports=()=>{setQuery('');setKind('all');setInbox(false);setTrash(false);};
  const addImages = () => run(async () => { const images=await pickImagesFromGallery(9);for (const image of images) await importCreativeImage(image, mode === 'projects' ? selected : undefined);if(images.length){revealImports();setImportOpen(false);} });
  const action = (label: string, onPress: () => void, secondary = true) => secondary ? <TextAction label={label} onPress={onPress} disabled={busy} /> : <ListAction label={label} onPress={onPress} disabled={busy} />;
  if (projectId && mode === 'projects' && !current) return <View style={styles.content}>{action('返回项目列表', back)}<Text style={styles.body}>{error || '正在读取项目…'}</Text></View>;
  return <KeyboardSurface style={styles.screen}><ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.row}>{projectId || assetId ? action('返回',back) : null}{mode==='assets' && !assetId?<View style={{flex:1}}/>:<Text accessibilityRole="header" style={styles.heading}>{activeAsset?.title ?? current?.title ?? (mode === 'projects' ? '项目' : '素材')}</Text>}{!assetId && !trash && (mode==='assets' || selected && projectView==='assets')?<ListAction label="导入素材" icon="add" disabled={busy} onPress={()=>setImportOpen(!importOpen)}/>:null}{action(manage ? '收起更多' : '更多', () => setManage(!manage))}</View>
    {manage && !activeAsset ? <View style={styles.row}>{action('历史作品', () => router.push('/(tabs)/gallery'))}{action('创作草稿', () => router.push('/creative-drafts'))}</View> : null}
    {current && projectView === 'assets' && !current.archivedAt && !activeAsset ? action('制作图片', () => void run(async () => { const result = await command({ name: 'draft.createImage', payload: { projectId: current.id } }); if (result.status === 'completed') router.push({ pathname: '/image-draft/[id]', params: { id: result.value.draftId } }); })) : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {mode === 'projects' && selected && !activeAsset ? <View style={styles.row}>{action(projectView === 'brief' ? '✓ 概览' : '概览', () => changeProjectView('brief'))}{action(projectView === 'shots' ? '✓ 镜头' : '镜头', () => changeProjectView('shots'))}{action(projectView === 'assets' ? '✓ 素材' : '素材', () => changeProjectView('assets'))}</View> : null}
    {mode === 'projects' && !activeAsset ? <>
      {!selected ? <View style={styles.row}>{action('新建项目', () => creating ? confirmLeave(discardBrief) : setCreating(true), false)}{action(archived ? '查看进行中项目' : '查看归档项目', () => { setArchived(!archived); setSelected(undefined); })}{selected ? action('全部项目', () => { setSelected(undefined); setTitle(''); setBrief(''); }) : null}</View> : null}
      {!selected?<TextInput accessibilityLabel="搜索项目" placeholder="搜索项目或简报" value={projectQuery} onChangeText={setProjectQuery} style={styles.input}/>:null}
      {!selected ? projects.filter(p=>(p.title+' '+p.brief).toLocaleLowerCase().includes(projectQuery.trim().toLocaleLowerCase())).map(p => <RecordRow key={p.id} title={p.title} detail={p.brief || '分镜、素材与创作记录'} meta={new Date(p.updatedAt).toLocaleDateString('zh-CN')} leading={covers[p.id]?.state==='AVAILABLE'&&covers[p.id]?.relative_path?<Image accessibilityLabel={`${p.title} 封面`} source={{uri:`${FileSystem.documentDirectory}${covers[p.id].relative_path}`}} style={{height:56,width:56,borderRadius:8}} resizeMode="cover"/>:undefined} onPress={()=>void run(()=>openProject(p))}/>) : null}
      {!projects.length ? <Text style={styles.body}>创建项目，将创作简报与素材组织在一起。</Text> : null}
      {current && projectView === 'brief' && !editingBrief ? <ProjectOverview project={current} onShots={() => changeProjectView('shots')} onEdit={() => setEditingBrief(true)} /> : null}
      {(!selected && creating) || (selected && projectView === 'brief' && editingBrief) ? <View style={styles.card}><Text style={styles.title}>{selected ? '项目简报' : '新建项目'}</Text>
        <TextInput accessibilityLabel="项目名称" placeholder="项目名称" value={title} onChangeText={setTitle} style={styles.input} />
        <TextInput accessibilityLabel="创作简报" placeholder="目标、角色、场景、风格和交付要求" multiline value={brief} onChangeText={setBrief} style={[styles.input, styles.multiline]} />
        {action(selected ? '保存简报' : '创建项目', () => void run(async () => {
          if (current) await command({ name: 'project.update', payload: { id: current.id, title, brief, expectedRevision: current.revision } });
          else { await command({ name: 'project.create', payload: { title, brief } }); setTitle(''); setBrief(''); setCreating(false); }
          setEditingBrief(false);
        }), false)}
        {action('取消编辑', () => confirmLeave(discardBrief))}
      </View> : null}
      {current && manage ? action(current.archivedAt ? '恢复项目' : '归档项目', () => void run(async () => { await command({ name: 'project.archive', payload: { id: current.id, archived: !current.archivedAt, expectedRevision: current.revision } }); setEditingBrief(false); })) : null}
      {manage&&current&&covers[current.id]?action('移除项目封面',()=>void run(()=>command({name:'project.setCover',payload:{id:current.id,expectedRevision:current.revision,versionId:null}}))):null}
    </> : null}
    {mode === 'projects' && selected && projectView === 'shots' && !activeAsset ? <ProjectShots key={selected} onEditorState={setShotEditor} projectId={selected} archived={Boolean(current?.archivedAt)} /> : null}
    {manage && mode === 'projects' && selected && !activeAsset ? action('选图与视频计划',()=>changeProjectView('plans')) : null}
    {mode === 'projects' && selected && projectView === 'plans' && !activeAsset ? <ProjectPlans key={selected} projectId={selected} archived={Boolean(current?.archivedAt)} /> : null}
    {mode === 'projects' && selected && !activeAsset ? action('修改建议与活动',()=>changeProjectView('activity')) : null}
    {mode === 'projects' && selected && projectView === 'activity' && !activeAsset ? <ProjectActivity key={selected} projectId={selected} /> : null}
    {activeAsset ? <View style={styles.card}>
      {!trash && manage ? action(metadata ? '收起素材信息' : '编辑名称与标签', () => setMetadata(!metadata)) : trash ? <Text style={styles.body}>此素材位于回收站，恢复后可继续创作。</Text> : null}
      {trash ? action('从回收站恢复',()=>void run(async()=>{await command({name:'asset.restore',payload:{id:activeAsset.id,expectedRevision:activeAsset.revision}});back();})) : metadata ? <>
        <TextInput accessibilityLabel="资产名称" value={assetTitle} onChangeText={setAssetTitle} style={styles.input} />
        <TextInput accessibilityLabel="资产说明" placeholder="创作说明" multiline value={assetDescription} onChangeText={setAssetDescription} style={styles.input} />
        <TextInput accessibilityLabel="资产标签" placeholder="标签，用逗号分隔" value={assetTags} onChangeText={setAssetTags} style={styles.input} />
        {action('保存说明与标签',()=>void run(async()=>{await command({name:'asset.describe',payload:{id:activeAsset.id,expectedRevision:activeAsset.revision,title:assetTitle,description:assetDescription,tags:assetTags.split(/[,，]/).map(s=>s.trim()).filter(Boolean)}});setActiveAsset({...activeAsset,title:assetTitle,revision:activeAsset.revision+1});setMetadataBaseline(JSON.stringify([assetTitle,assetDescription,assetTags]));}))}
        {metadataDirty ? action('取消素材修改', () => confirmLeave(() => void run(() => inspect(activeAsset)))) : null}
        {action('移入回收站',()=>Alert.alert('移入回收站','仍被项目、镜头或草稿引用的资产会阻止此操作。回收站保留文件，可恢复。',[{text:'取消',style:'cancel'},{text:'移入',onPress:()=>void run(async()=>{await command({name:'asset.trash',payload:{id:activeAsset.id,expectedRevision:activeAsset.revision}});back();})}]))}
      </> : null}
      {versions.length>1?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{versions.map(v => <Pressable key={v.id} accessibilityRole="button" accessibilityLabel={`查看版本 ${v.versionNo}`} accessibilityState={{ selected: visibleVersion?.id === v.id }} onPress={() => { setVersionId(v.id); setProjectActions(false); }} style={{ borderWidth: 2, borderColor: visibleVersion?.id === v.id ? COLORS.primary : COLORS.border, borderRadius: 12, padding: 4, gap: 4, minHeight: 48 }}><MediaPreview version={v} kind={activeAsset.kind} label={`版本 ${v.versionNo} 缩略图`} style={{ width: 64, aspectRatio: 1 }} /><Text style={styles.body}>版本 {v.versionNo}</Text></Pressable>)}</ScrollView>:null}
      {versions.filter(v => v.id === visibleVersion?.id).map(v => <View key={v.id} style={{ gap: 16 }}>
        <Text style={styles.body}>版本 {v.versionNo} · {activeAsset.currentVersionId === v.id ? '素材默认版本' : '历史版本'} · {v.state === 'AVAILABLE' ? '本地可用' : '文件待恢复'}</Text>
        {v.mime?.startsWith('image/') ? <MediaPreview version={v} label={`版本 ${v.versionNo} 预览`} contain style={{ aspectRatio: 4 / 3 }} /> : null}
        {activeAsset.kind==='image'?<ImageMetadataPanel key={v.id} version={v} label="信息" />:null}
        {!trash && activeAsset.kind==='image' && v.state==='AVAILABLE'?action('增强 / 放大',()=>setProcessing(true)):null}
        {processing?<ImageProcessingSheet version={v} projectId={selected} onClose={()=>setProcessing(false)} />:null}
        {v.state === 'AVAILABLE' && v.relativePath && v.mime?.startsWith('video/') ? <View style={{height:260,width:'100%',borderRadius:12,overflow:'hidden'}}><VideoPlayer source={`${FileSystem.documentDirectory}${v.relativePath}`} /></View> : null}
        {v.state==='AVAILABLE'&&v.mime==='application/pdf'?<PdfVersionPreview key={v.id} version={v}/>:null}
        {v.state==='AVAILABLE'&&v.mime?.startsWith('audio/')?<AudioVersionPreview version={v}/>:null}
        {v.state==='AVAILABLE'&&['text/plain','text/markdown','application/json'].includes(v.mime??'')?<TextVersionPreview version={v}/>:null}
        {!trash&&v.state==='AVAILABLE'&&['text/plain','text/markdown'].includes(v.mime??'')?<TextVersionEditor key={`${v.id}:${activeAsset.revision}`} asset={activeAsset} version={v} onSaved={async()=>{const updated=await creativeService().asset(activeAsset.id);if(updated)await inspect(updated);}}/>:null}
        {v.state === 'AVAILABLE' && (CREATIVE_FILE_MIMES as readonly string[]).includes(v.mime ?? '') ? action(creativeExportTarget(v.mime??'')==='system-gallery'?'保存到系统相册':'保存到下载文件夹', () => void run(() => exportCreativeVersion(v.id))) : null}
        {v.state !== 'AVAILABLE' && activeAsset.kind === 'image' ? <><Text style={styles.body}>版本记录仍保留。请重新选择原始图片；内容不同会拒绝替换。</Text>{action('重新定位原图', () => void run(async () => { const [image] = await pickImagesFromGallery(1); if (image) { await restoreCreativeImage(v.id, image); await inspect(activeAsset); } }))}</> : null}
        {v.state !== 'AVAILABLE' && activeAsset.kind === 'image' ? action('从文件备份找回', () => void run(async () => { await restoreCreativeImageFromBackup(v.id); await inspect(activeAsset); })) : null}
        {deliveries[v.id] ? <Text style={styles.body}>{({ QUEUED: '等待保存', PUBLISHING: '正在保存', EXPORTED: '文件已保存', FAILED: '保存失败，请检查源文件', DELIVERY_UNKNOWN: '保存结果不确定，请先检查相册或下载文件夹', QUARANTINED: '恢复的保存操作已隔离，未重新执行' } as Record<string, string>)[deliveries[v.id]!.status]}</Text> : null}
        {deliveries[v.id] && ['EXPORTED','FAILED','DELIVERY_UNKNOWN','QUARANTINED'].includes(deliveries[v.id]!.status) ? action('另存一份', () => Alert.alert('另存一份文件', '这会发起新的保存操作，目标文件夹中可能出现重复文件。', [{ text: '取消', style: 'cancel' }, { text: '继续保存', onPress: () => void run(() => exportCreativeVersion(v.id, deliveries[v.id]!.generation + 1)) }])) : null}
        {!trash && manage && v.state === 'AVAILABLE' ? action('设为默认版本', () => void run(async () => { await command({ name: 'asset.setDefaultVersion', payload: { id: activeAsset.id, versionId: v.id, expectedRevision: activeAsset.revision } }); const updated = await creativeService().asset(activeAsset.id); if (updated) await inspect(updated); })) : null}
        {manage && typeof v.recipe.jobId === 'string' ? <Text style={styles.body}>来源任务：{v.recipe.jobId}</Text> : null}
        {Array.isArray(v.recipe.notices) ? v.recipe.notices.map((notice,i)=><Text key={i} style={styles.body}>{String(notice)}</Text>) : null}
        {!trash && activeAsset.kind === 'image' && v.recipe.input ? action('恢复参数并继续出图', () => void run(async () => { const result=await command({name:'draft.createImage',payload:{fromVersionId:v.id,projectId:selected}}); if(result.status==='completed')router.push({pathname:'/image-draft/[id]',params:{id:result.value.draftId}}); })) : null}
        {activeAsset.kind === 'image' && !v.recipe.input ? <Text style={styles.body}>没有可完整恢复的生成参数；保留原文件，不猜测原始提示词。</Text> : null}
        {v.state !== 'AVAILABLE' && activeAsset.kind !== 'image' ? <><Text style={styles.body}>原件尚不可用。版本与来源保留，只接受与已记录哈希相同的文件。</Text>{action('重新定位原文件',()=>void run(async()=>{await locateCreativeFile(v.id);await inspect(activeAsset);}))}{action('从备份恢复原文件',()=>void run(async()=>{await restoreCreativeFileFromBackup(v.id);await inspect(activeAsset);}))}</> : null}
        {!trash && manage && v.state === 'AVAILABLE' && activeAsset.kind === 'image' ? action('从此版本创建视频草稿', () => void run(async () => { const result = await command({ name: 'draft.createVideo', payload: { versionId: v.id, ...(selected ? { projectId: selected } : {}) } }); if (result.status === 'completed') router.push({ pathname: '/creative-draft/[id]', params: { id: result.value.draftId } }); })) : null}
        {!trash && manage && v.state === 'AVAILABLE' ? action(projectActions ? '收起项目选择' : '加入项目或更新采用版本', () => setProjectActions(!projectActions)) : null}
        {projectActions ? <><TextInput accessibilityLabel="搜索项目" placeholder="搜索项目" value={projectQuery} onChangeText={setProjectQuery} style={styles.input} />
        {projects.filter(p => p.title.includes(projectQuery) && !p.archivedAt && !links.some(l => l.project_id === p.id)).map(p => <View key={p.id}>{action(`加入 ${p.title}（固定此版本）`, () => void run(async () => { await command({ name: 'asset.linkToProject', payload: { assetId: activeAsset.id, projectId: p.id, versionId: v.id } }); await inspect(activeAsset); }))}</View>)}
        {links.filter(l => l.title.includes(projectQuery) && l.pinned_version_id !== v.id).map(l => <View key={l.project_id}>{action(`将 ${l.title} 固定到此版本`, () => void run(async () => { await command({ name: 'asset.pinProjectVersion', payload: { assetId: activeAsset.id, projectId: l.project_id, expectedRevision: l.revision, versionId: v.id } }); await inspect(activeAsset); }))}</View>)}
        {manage&&activeAsset.kind==='image'&&v.state==='AVAILABLE'?links.map(l=>{const p=projects.find(p=>p.id===l.project_id);return p&&!p.archivedAt?<View key={`cover-${p.id}`}>{action(`设为 ${p.title} 封面`,()=>void run(async()=>{await creativeFiles().verify(v.id);await command({name:'project.setCover',payload:{id:p.id,expectedRevision:p.revision,versionId:v.id}});} ))}</View>:null;}):null}
        </> : null}
      </View>)}
      {manage && versions.length > 1 ? <SettingRow label="比较版本" value="选择两个画面，查看变化" expanded={comparing} onPress={() => setComparing(!comparing)} /> : null}
      {comparing ? <VersionComparison key={activeAsset.id} versions={versions} /> : null}
      {manage ? <Text style={styles.title}>使用位置</Text> : null}
      {manage ? links.map(link => <View key={link.project_id}><Text style={styles.body}>{link.title} · {link.pinned_version_id ? '固定版本' : '跟随默认'}</Text>{manage ? action(`从 ${link.title} 移出`, () => void run(async () => { await command({ name: 'asset.unlinkFromProject', payload: { assetId: activeAsset.id, projectId: link.project_id, expectedRevision: link.revision } }); await inspect(activeAsset); })) : null}</View>) : null}
      {manage && !links.length ? <Text style={styles.body}>未加入项目，保存在收件箱。</Text> : null}
      {manage ? links.filter(l => l.pinned_version_id).map(l => <View key={l.project_id}>{action(`让 ${l.title} 跟随默认版本`, () => void run(async () => { await command({ name: 'asset.pinProjectVersion', payload: { assetId: activeAsset.id, projectId: l.project_id, expectedRevision: l.revision, versionId: null } }); await inspect(activeAsset); }))}</View>) : null}
    </View> : assetId ? <Text style={styles.body}>{error ? '请返回素材列表选择可用素材。' : '正在读取素材…'}</Text> : mode === 'assets' || (selected && projectView === 'assets') ? <>
      {importOpen && !trash?<View style={styles.card}><Text style={styles.title}>选择导入方式</Text><View style={styles.row}>{action('从相册导入图片',()=>void addImages())}{action('从文件导入',()=>void run(async()=>{const count=await pickCreativeFiles(mode==='projects'?selected:undefined);if(count){revealImports();setImportOpen(false);}}))}</View><Text style={styles.body}>支持视频、音频和文档，单个文件最多 100MB。</Text><TextAssetEditor projectId={mode==='projects'?selected:undefined} onSaved={async()=>{revealImports();await refresh();}}/></View>:null}
      <TextInput accessibilityLabel="搜索资产" placeholder="搜索素材名称" value={query} onChangeText={setQuery} style={styles.input} />
      {mode==='assets' && !trash?<ListFilters compact label="素材范围" value={inbox?'inbox':'all'} onChange={value=>setInbox(value==='inbox')} options={[{id:'all',label:'全部素材'},{id:'inbox',label:'未加入项目'}]}/>:null}
      {manage&&mode==='assets'?action(trash?'返回全部资产':'回收站',()=>{setTrash(!trash);setInbox(false);}):null}
      {!visibleAssets.length ? <Text style={styles.body}>{query || kind !== 'all' ? '没有符合筛选条件的素材，请调整搜索或素材类型。' : trash ? '回收站为空。' : '还没有素材。导入图片后可加入多个项目，文件只保留一份。'}</Text> : null}
      <ListFilters compact label="素材类型" value={kind} onChange={setKind} options={[{id:'all',label:'全部'},{id:'image',label:'图片'},{id:'video',label:'视频'},{id:'document',label:'文本与其他'}]} />
      <View style={styles.row}>{visibleAssets.map(a => <AssetTile key={a.id} asset={a} onPress={() => router.push({pathname:'/creative-asset/[id]',params:{id:a.id,...(selected?{projectId:selected}:{}),...(trash?{trash:'1'}:{})}})} />)}</View>
      {assets.length >= assetLimit && assetLimit < 1000 ? action('加载更多素材', () => setAssetLimit(n => n + 100)) : null}<Text style={styles.body}>已显示 {assets.length} 项{assetLimit >= 1000 && assets.length >= 1000 ? ' · 请通过搜索缩小范围' : ''}</Text>
      {manage ? action('迁入历史作品（可中断）', () => void run(async () => { const result = await migrateCreativeHistory(); setMigrationNotice(`本批迁入或更新 ${result.imported} 项。${result.pending ? '还有记录，点击继续迁入。' : '已追平当前历史记录。'} 待处理变更 ${result.audit.pendingJournal}，未迁入 ${result.audit.unmapped}，待更新映射 ${result.audit.staleMappings}，原件不可用 ${result.audit.unavailableFiles}。${result.audit.missingPins||result.audit.brokenMappings||result.audit.foreignKeyViolations?'检测到一致性异常，请保留备份并停止清理文件。':''}${result.audit.writersReady?'':'旧入口仍处于兼容追平阶段，尚未切换写入源。'}`); })) : null}
      {migrationNotice ? <Text accessibilityLiveRegion="polite" style={styles.body}>{migrationNotice}</Text> : null}
    </> : null}
  </ScrollView></KeyboardSurface>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background }, content: { padding: 16, gap: 12, paddingBottom: 40 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, heading: { fontSize: 26, color: COLORS.text, fontWeight: '700', flexGrow: 1 },
  card: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 16, borderColor: COLORS.border, borderWidth: 1, gap: 12 },
  title: { fontSize: 18, color: COLORS.text, fontWeight: '600' }, body: { color: COLORS.textMuted, lineHeight: 22 }, error: { color: COLORS.danger },
  input: { borderWidth: 1, borderColor: COLORS.controlBorder, borderRadius: 10, padding: 12, color: COLORS.text, backgroundColor: COLORS.surface, minHeight: 48 }, multiline: { minHeight: 110, textAlignVertical: 'top' }, preview: { width: '100%', height: 280 },
});
