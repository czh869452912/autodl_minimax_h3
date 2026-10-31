import {CreativeAssetPicker} from './CreativeAssetPicker';
import {useUnsavedChanges} from './useUnsavedChanges';
import {useCallback,useState,useRef} from 'react';
import {Text,TextInput,View,ScrollView} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {getDatabase} from '../storage/databaseClient';
import {creativeService} from './runtime';
import {createId} from '../ids';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from './creativeUI';
import {readSemanticResources,type SemanticEntity} from './semanticResources';
import type {CreativeCommand} from './types';
type Version={id:string;version_no:number;content:string};
export function SemanticResourcesScreen(){
 const {projectId}=useLocalSearchParams<{projectId:string}>(),router=useRouter();
 const [items,setItems]=useState<SemanticEntity[]>([]),[versions,setVersions]=useState<Version[]>([]),[selected,setSelected]=useState<SemanticEntity>();
 const lock=useRef(false);
 const [picking,setPicking]=useState<'image'|'audio'>(),[referencesDirty,setReferencesDirty]=useState(false);
 const [purpose,setPurpose]=useState('外观参考');
 const [references,setReferences]=useState<Array<{versionId:string;purpose:string}>>([]);
 const [bound,setBound]=useState<Array<{title:string;version_no:number;stale:number}>>([]);
 const [title,setTitle]=useState(''),[content,setContent]=useState(''),[kind,setKind]=useState<'character'|'scene'|'style'|'voice'>('character');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[next,setNext]=useState<string|null>(null);
 const [shots,setShots]=useState<Awaited<ReturnType<ReturnType<typeof creativeService>['shots']>>>([]);
 const confirmLeave=useUnsavedChanges(Boolean(content.trim()||title.trim()||referencesDirty),busy);
 const refresh=useCallback(async()=>{const page=await readSemanticResources(getDatabase(),projectId);setItems(page.items);setNext(page.nextCursor);setShots(await creativeService().shots(projectId));},[projectId]);
 useFocusEffect(useCallback(()=>{void refresh().catch(e=>setError(String(e.message)));},[refresh]));
 const choose=async(entity:SemanticEntity)=>{setSelected(entity);setBound(await getDatabase().getAllAsync<{title:string;version_no:number;stale:number}>("SELECT s.title,v.version_no,CASE WHEN e.current_version_id IS NOT NULL AND b.version_id!=e.current_version_id THEN 1 ELSE 0 END AS stale FROM creative_shot_semantics b JOIN creative_shots s ON s.id=b.shot_id AND s.deleted_at IS NULL JOIN creative_semantic_versions v ON v.id=b.version_id JOIN creative_semantic_entities e ON e.id=b.entity_id WHERE b.entity_id=? ORDER BY s.sort_key LIMIT 50",entity.id));setVersions(await getDatabase().getAllAsync<Version>('SELECT id,version_no,content FROM creative_semantic_versions WHERE entity_id=? ORDER BY version_no DESC LIMIT 20',entity.id));setReferences((await getDatabase().getAllAsync<{asset_version_id:string;purpose:string}>('SELECT asset_version_id,purpose FROM creative_semantic_references WHERE semantic_version_id=?',entity.current_version_id??'')).map(r=>({versionId:r.asset_version_id,purpose:r.purpose})));setContent('');setReferencesDirty(false);};
 const execute=async(command:CreativeCommand)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await creativeService().execute(command,createId());await refresh();setContent('');setTitle('');setReferencesDirty(false);if(selected){const entity=await getDatabase().getFirstAsync<SemanticEntity>('SELECT * FROM creative_semantic_entities WHERE id=?',selected.id);if(entity)await choose(entity);}}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{lock.current=false;setBusy(false);}};
 return <SafeAreaView style={s.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:12}}>
  <ListAction label="返回项目" secondary onPress={()=>confirmLeave(()=>router.back())}/><Text style={s.title}>项目设定</Text>
  <Text style={s.muted}>设定版本需明确采用。镜头固定引用的旧版本不会随设定更新而替换。</Text>
  {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  {items.map(item=><ListAction key={item.id} label={`${item.title} · ${item.current_version_id?'已有采用版本':'待审阅'}`} secondary disabled={busy} onPress={()=>confirmLeave(()=>void choose(item).catch(e=>setError(e.message)))}/>)}
  {next?<ListAction label="更多设定" secondary onPress={()=>void readSemanticResources(getDatabase(),projectId,next).then(page=>{setItems(rows=>[...rows,...page.items]);setNext(page.nextCursor);}).catch(e=>setError(e.message))}/>:null}
  {selected?<View style={{gap:10}}><Text style={s.title}>{selected.title}</Text><Text style={s.muted}>显示最近 20 个版本；下方可编辑新版本的参考素材，已保存版本不受影响。</Text>
   {bound.map((b,i)=><Text key={i} style={s.muted}>{b.title} · 固定版本 {b.version_no}{b.stale?' · 设定已更新，待复核':''}</Text>)}
   {versions.map(version=><View key={version.id} style={s.card}><Text style={s.title}>版本 {version.version_no}{selected.current_version_id===version.id?' · 已采用':''}</Text><Text selectable style={s.body}>{version.content}</Text>
    <ListAction label={`采用版本 ${version.version_no}`} secondary disabled={busy||selected.current_version_id===version.id} onPress={()=>void execute({name:'semantic.adopt',payload:{entityId:selected.id,expectedRevision:selected.revision,versionId:version.id}})}/>
    {selected.current_version_id===version.id?shots.map(shot=><ListAction key={shot.id} label={`绑定到 ${shot.title}`} secondary disabled={busy} onPress={()=>void execute({name:'semantic.bindShot',payload:{entityId:selected.id,versionId:version.id,shotId:shot.id,expectedShotRevision:shot.revision}})}/>):null}
   </View>)}
   <ListAction label="新建设定" secondary onPress={()=>confirmLeave(()=>{setSelected(undefined);setContent('');setReferences([]);setReferencesDirty(false);})}/>
  </View>:<View style={{gap:8}}><TextInput accessibilityLabel="设定名称" placeholder="设定名称" value={title} onChangeText={setTitle} style={s.input}/><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{([['character','角色'],['scene','场景'],['style','风格'],['voice','声音']] as const).map(([value,label])=><ListAction key={value} label={label} secondary={kind!==value} onPress={()=>setKind(value)}/>)}</View></View>}
  <Text style={s.title}>参考素材 · {references.length}/20</Text>
  <Text style={s.muted}>固定引用项目内的具体版本；保存设定不会自动向模型发送素材。</Text>
  {references.map(ref=><View key={ref.versionId} style={s.card}><Text selectable style={s.body}>{ref.purpose} · {ref.versionId}</Text><ListAction label={'移除 '+ref.purpose} secondary disabled={busy} onPress={()=>{setReferences(rows=>rows.filter(r=>r.versionId!==ref.versionId));setReferencesDirty(true);}}/></View>)}
  <TextInput accessibilityLabel="参考用途" value={purpose} onChangeText={setPurpose} maxLength={100} placeholder="例如：外观、服饰、音色" style={s.input}/>
  <ListAction label="添加图片参考" secondary disabled={busy||references.length>=20||!purpose.trim()} onPress={()=>setPicking('image')}/>
  <ListAction label="添加声音参考" secondary disabled={busy||references.length>=20||!purpose.trim()} onPress={()=>setPicking('audio')}/>
  <TextInput accessibilityLabel="设定内容" placeholder="特征、约束与禁止变化项" multiline value={content} onChangeText={setContent} maxLength={20000} style={[s.input,{minHeight:120}]}/>
  <ListAction label="保存为待审版本" disabled={busy||!content.trim()||(!selected&&!title.trim())} onPress={()=>void execute(selected?{name:'semantic.revise',payload:{entityId:selected.id,expectedRevision:selected.revision,content,references}}:{name:'semantic.create',payload:{projectId,kind,title,content,references}})}/>
 </ScrollView>{picking?<CreativeAssetPicker kind={picking} projectId={projectId} restrictToProject purpose="reference" target={selected?.title??title} onClose={()=>setPicking(undefined)} onChoose={async version=>{setReferences(rows=>[...rows.filter(r=>r.versionId!==version.id),{versionId:version.id,purpose:purpose.trim()}]);setReferencesDirty(true);}}/>:null}</SafeAreaView>;
}
