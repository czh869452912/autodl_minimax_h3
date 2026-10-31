import {AudioVersionPreview} from './AudioVersionPreview';
import {readSemanticDetail,readSemanticVersionPage,readSemanticVersion,type SemanticVersionDetail} from './semanticReads';
import * as FileSystem from 'expo-file-system/legacy';
import {CreativeAssetPicker} from './CreativeAssetPicker';
import {useUnsavedChanges} from './useUnsavedChanges';
import {useCallback,useState,useRef,useEffect} from 'react';
import {Image,Text,TextInput,View,ScrollView} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {getDatabase} from '../storage/databaseClient';
import {creativeService} from './runtime';
import {createId} from '../ids';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from './creativeUI';
import {readShotSemantics,readSemanticResources,type SemanticEntity} from './semanticResources';
import type {CreativeCommand} from './types';
type Version=SemanticVersionDetail;
export function SemanticResourcesScreen(){
 const {projectId,versionId:routeVersionId}=useLocalSearchParams<{projectId:string;versionId?:string}>(),router=useRouter();
 const [items,setItems]=useState<SemanticEntity[]>([]),[versions,setVersions]=useState<Version[]>([]),[selected,setSelected]=useState<SemanticEntity>();
 const lock=useRef(false),detailEpoch=useRef(0);
 const [audio,setAudio]=useState<string>();
 const [versionNext,setVersionNext]=useState<number|null>(null),[reading,setReading]=useState(false);
 const [replacement,setReplacement]=useState<{shotId:string;revision:number;versionId:string;choices:Array<{entity_id:string;title:string}>}>();
 const [picking,setPicking]=useState<'image'|'audio'>(),[referencesDirty,setReferencesDirty]=useState(false);
 const [purpose,setPurpose]=useState('外观参考');
 const [references,setReferences]=useState<Array<{versionId:string;purpose:string}>>([]);
 const [bound,setBound]=useState<Array<{shot_id:string;revision:number;title:string;version_no:number;stale:number}>>([]);
 const [title,setTitle]=useState(''),[content,setContent]=useState(''),[kind,setKind]=useState<'character'|'scene'|'style'|'voice'>('character');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[next,setNext]=useState<string|null>(null);
 const [shots,setShots]=useState<Awaited<ReturnType<ReturnType<typeof creativeService>['shots']>>>([]);
 const confirmLeave=useUnsavedChanges(Boolean(content.trim()||title.trim()||referencesDirty),busy);
 const refresh=useCallback(async()=>{const page=await readSemanticResources(getDatabase(),projectId);setItems(page.items);setNext(page.nextCursor);setShots(await creativeService().shots(projectId));},[projectId]);
 useFocusEffect(useCallback(()=>{void refresh().catch(e=>setError(String(e.message)));},[refresh]));
 const choose=async(entity:SemanticEntity,preserveEditor=false)=>{
  const epoch=++detailEpoch.current;setReading(true);setAudio(undefined);setReplacement(undefined);setSelected(entity);setVersions([]);setBound([]);setVersionNext(null);
  if(!preserveEditor){setReferences([]);setContent('');setReferencesDirty(false);}
  try{const detail=await readSemanticDetail(getDatabase(),projectId,entity.id);if(epoch!==detailEpoch.current)return;
   setSelected(detail.entity);setBound(detail.bindings);setVersions(detail.adopted?[detail.adopted,...detail.page.items.filter(v=>v.id!==detail.adopted!.id)]:detail.page.items);setVersionNext(detail.page.next);
   if(!preserveEditor)setReferences((detail.adopted?.references??[]).map(r=>({versionId:r.asset_version_id,purpose:r.purpose})));
  }finally{if(epoch===detailEpoch.current)setReading(false);}
 };
 const moreVersions=async()=>{if(!selected||!versionNext||reading)return;const epoch=detailEpoch.current;setReading(true);try{const page=await readSemanticVersionPage(getDatabase(),projectId,selected.id,versionNext);if(epoch!==detailEpoch.current)return;setVersions(rows=>[...rows,...page.items.filter(v=>!rows.some(r=>r.id===v.id))]);setVersionNext(page.next);}catch(e){setError(e instanceof Error?e.message:'版本读取失败');}finally{if(epoch===detailEpoch.current)setReading(false);}};
 useEffect(()=>{if(!routeVersionId)return;let active=true;void getDatabase().getFirstAsync<SemanticEntity>('SELECT e.* FROM creative_semantic_entities e JOIN creative_semantic_versions v ON v.entity_id=e.id WHERE e.project_id=? AND v.id=?',projectId,routeVersionId).then(async entity=>{if(!active||!entity)return;const expectedEpoch=detailEpoch.current+1;await choose(entity);if(expectedEpoch!==detailEpoch.current)return;const version=await readSemanticVersion(getDatabase(),projectId,entity.id,routeVersionId);if(active&&expectedEpoch===detailEpoch.current)setVersions(rows=>rows.some(v=>v.id===version.id)?rows:[version,...rows]);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;detailEpoch.current++;};},[projectId,routeVersionId]);
 const execute=async(command:CreativeCommand)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await creativeService().execute(command,createId());await refresh();if(command.name==='semantic.create'||command.name==='semantic.revise'){setContent('');setTitle('');setReferencesDirty(false);}if(selected){const entity=await getDatabase().getFirstAsync<SemanticEntity>('SELECT * FROM creative_semantic_entities WHERE id=?',selected.id);if(entity)await choose(entity,true);}}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{lock.current=false;setBusy(false);}};
 return <SafeAreaView style={s.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:12}}>
  <ListAction label="返回项目" secondary onPress={()=>confirmLeave(()=>router.back())}/><Text style={s.title}>项目设定</Text>
  <Text style={s.muted}>设定版本需明确采用。镜头固定引用的旧版本不会随设定更新而替换。</Text>
  {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  {items.map(item=><ListAction key={item.id} label={`${item.title} · ${item.current_version_id?'已有采用版本':'待审阅'}`} secondary disabled={busy} onPress={()=>confirmLeave(()=>void choose(item).catch(e=>setError(e.message)))}/>)}
  {next?<ListAction label="更多设定" secondary onPress={()=>void readSemanticResources(getDatabase(),projectId,next).then(page=>{setItems(rows=>[...rows,...page.items]);setNext(page.nextCursor);}).catch(e=>setError(e.message))}/>:null}
  {selected?<View style={{gap:10}}><Text style={s.title}>{selected.title}</Text><Text style={s.muted}>当前采用版本始终显示；可继续读取历史候选。各版本参考素材在对应卡片中列出。</Text>
   {bound.map(b=><View key={b.shot_id}><Text style={s.muted}>{b.title} · 固定版本 {b.version_no}{b.stale?' · 设定已更新，待复核':''}</Text><ListAction label={'解除 '+b.title+' 的绑定'} secondary disabled={busy} onPress={()=>void execute({name:'semantic.unbindShot',payload:{entityId:selected.id,shotId:b.shot_id,expectedShotRevision:b.revision}})}/></View>)}
   {versions.map(version=><View key={version.id} style={s.card}><Text style={s.title}>版本 {version.version_no}{selected.current_version_id===version.id?' · 已采用':''}</Text><Text selectable style={s.body}>{version.content}</Text><Text style={s.muted}>此版本参考 · {version.references.length} 项</Text>
    {version.references.map(ref=><View key={ref.asset_version_id} style={{gap:6}}><Text selectable style={s.body}>{ref.title} · v{ref.version_no} · {ref.purpose}{ref.unavailable_reason?' · 不可用：'+ref.unavailable_reason:''}{'\n'}{ref.asset_version_id}</Text>{ref.kind==='image'&&!ref.unavailable_reason&&ref.relative_path?<Image accessibilityLabel={ref.title+' · '+ref.purpose} source={{uri:FileSystem.documentDirectory+ref.relative_path}} style={{height:160,width:'100%'}} resizeMode="contain"/>:null}{ref.kind==='audio'&&!ref.unavailable_reason?<><ListAction label={audio===ref.asset_version_id?'关闭声音预览':'试听 '+ref.title} secondary onPress={()=>setAudio(audio===ref.asset_version_id?undefined:ref.asset_version_id)}/>{audio===ref.asset_version_id?<AudioVersionPreview version={{id:ref.asset_version_id,assetId:ref.asset_id,versionNo:ref.version_no,source:ref.source,state:'AVAILABLE',recipe:{},mime:ref.mime,blobSha256:ref.blob_sha256,relativePath:ref.relative_path??undefined}}/>:null}</>:null}</View>)}

    <ListAction label={`采用版本 ${version.version_no}`} secondary disabled={busy||reading||version.references.some(r=>r.unavailable_reason)||selected.current_version_id===version.id} onPress={()=>void execute({name:'semantic.adopt',payload:{entityId:selected.id,expectedRevision:selected.revision,versionId:version.id}})}/>
    {selected.current_version_id===version.id?shots.map(shot=><View key={shot.id}><ListAction label={`绑定到 ${shot.title}`} secondary disabled={busy} onPress={()=>void execute({name:'semantic.bindShot',payload:{entityId:selected.id,versionId:version.id,shotId:shot.id,expectedShotRevision:shot.revision}})}/><ListAction label={'替换 '+shot.title+' 的其他设定'} secondary disabled={busy} onPress={()=>void readShotSemantics(getDatabase(),shot.id,projectId).then(bindings=>{const other=bindings.filter(b=>b.entity_id!==selected.id);if(!other.length){setError('此镜头没有其他设定可替换');return;}setReplacement({shotId:shot.id,revision:shot.revision,versionId:version.id,choices:other});}).catch(e=>setError(e.message))}/></View>):null}
   </View>)}
   {versionNext?<ListAction label="更多历史版本" secondary disabled={busy||reading} onPress={()=>void moreVersions()}/>:null}
   <ListAction label="新建设定" secondary onPress={()=>confirmLeave(()=>{detailEpoch.current++;setReading(false);setAudio(undefined);setSelected(undefined);setContent('');setReferences([]);setReferencesDirty(false);})}/>
  </View>:<View style={{gap:8}}><TextInput editable={!busy} accessibilityLabel="设定名称" placeholder="设定名称" value={title} onChangeText={setTitle} style={s.input}/><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{([['character','角色'],['scene','场景'],['style','风格'],['voice','声音']] as const).map(([value,label])=><ListAction key={value} label={label} secondary={kind!==value} onPress={()=>setKind(value)}/>)}</View></View>}
  {replacement&&selected?<View style={s.card}><Text style={s.title}>选择被替换的设定</Text>{replacement.choices.map(b=><ListAction key={b.entity_id} label={'替换 '+b.title} disabled={busy} onPress={()=>{void execute({name:'semantic.bindShot',payload:{entityId:selected.id,versionId:replacement.versionId,shotId:replacement.shotId,expectedShotRevision:replacement.revision,replaceEntityId:b.entity_id}});setReplacement(undefined);}}/>)}<ListAction label="取消替换" secondary onPress={()=>setReplacement(undefined)}/></View>:null}
  <Text style={s.title}>参考素材 · {references.length}/20</Text>
  <Text style={s.muted}>固定引用项目内的具体版本；保存设定不会自动向模型发送素材。</Text>
  {references.map(ref=><View key={ref.versionId} style={s.card}><Text selectable style={s.body}>{ref.purpose} · {ref.versionId}</Text><ListAction label={'移除 '+ref.purpose} secondary disabled={busy} onPress={()=>{setReferences(rows=>rows.filter(r=>r.versionId!==ref.versionId));setReferencesDirty(true);}}/></View>)}
  <TextInput editable={!busy&&!reading} accessibilityLabel="参考用途" value={purpose} onChangeText={setPurpose} maxLength={100} placeholder="例如：外观、服饰、音色" style={s.input}/>
  <ListAction label="添加图片参考" secondary disabled={busy||references.length>=20||!purpose.trim()} onPress={()=>setPicking('image')}/>
  <ListAction label="添加声音参考" secondary disabled={busy||references.length>=20||!purpose.trim()} onPress={()=>setPicking('audio')}/>
  <TextInput editable={!busy&&!reading} accessibilityLabel="设定内容" placeholder="特征、约束与禁止变化项" multiline value={content} onChangeText={setContent} maxLength={20000} style={[s.input,{minHeight:120}]}/>
  <ListAction label="保存为待审版本" disabled={busy||reading||!content.trim()||(!selected&&!title.trim())} onPress={()=>void execute(selected?{name:'semantic.revise',payload:{entityId:selected.id,expectedRevision:selected.revision,content,references}}:{name:'semantic.create',payload:{projectId,kind,title,content,references}})}/>
 </ScrollView>{picking?<CreativeAssetPicker kind={picking} projectId={projectId} restrictToProject purpose="reference" target={selected?.title??title} onClose={()=>setPicking(undefined)} onChoose={async version=>{setReferences(rows=>[...rows.filter(r=>r.versionId!==version.id),{versionId:version.id,purpose:purpose.trim()}]);setReferencesDirty(true);}}/>:null}</SafeAreaView>;
}
