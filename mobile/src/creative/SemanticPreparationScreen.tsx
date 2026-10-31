import {useEffect,useState} from 'react';
import {ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {getDatabase} from '../storage/databaseClient';
import {readShotSemantics} from './semanticResources';
import {readSemanticReferences} from './semanticDependencies';
import {creativeService} from './runtime';
import {createId} from '../ids';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from './creativeUI';
export function SemanticPreparationScreen(){
 const {projectId,shotId}=useLocalSearchParams<{projectId:string;shotId:string}>(),router=useRouter();
 const [shot,setShot]=useState<{revision:number;description:string}>(),[items,setItems]=useState<Awaited<ReturnType<typeof readShotSemantics>>>([]),[refs,setRefs]=useState<Awaited<ReturnType<typeof readSemanticReferences>>>([]);
 const [texts,setTexts]=useState<string[]>([]),[media,setMedia]=useState<string[]>([]),[prompt,setPrompt]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;void(async()=>{const db=getDatabase(),row=await db.getFirstAsync<{revision:number;description:string}>('SELECT revision,description FROM creative_shots WHERE id=? AND project_id=? AND deleted_at IS NULL',shotId,projectId);if(!row)throw Error('镜头不可用');const bindings=await readShotSemantics(db,shotId,projectId);const references=(await Promise.all(bindings.map(b=>readSemanticReferences(db,b.version_id,projectId)))).flat();if(active){setShot(row);setPrompt(row.description);setItems(bindings);setRefs(references.filter((r,i,all)=>all.findIndex(x=>x.asset_version_id===r.asset_version_id)===i));}})().catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[projectId,shotId]);
 const toggle=(ids:string[],id:string)=>ids.includes(id)?ids.filter(v=>v!==id):[...ids,id];
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={{padding:16,gap:12}}><ListAction label="返回镜头" secondary disabled={busy} onPress={()=>router.back()}/><Text style={s.title}>本次如何使用设定</Text><Text style={s.body}>未勾选的设定仅作本地背景。勾选正文会编入提示词，勾选素材会进入生成输入；当前镜头选定图片继续作为主参考。这里只新建可审阅草稿，不发送素材或生成。</Text>
 <TextInput accessibilityLabel="本次镜头提示词" style={s.input} multiline editable={!busy} value={prompt} onChangeText={setPrompt}/>
 {items.map(item=><View key={item.version_id} style={s.card}><Text selectable style={s.body}>{item.title} · {item.version_id}{item.stale?' · 采用版本已更新':''}{'\n'}{item.content}</Text><ListAction label={(texts.includes(item.version_id)?'✓ ':'')+'编入正文 '+item.title} secondary disabled={busy} onPress={()=>setTexts(old=>toggle(old,item.version_id))}/></View>)}
 {refs.map(ref=><View key={ref.asset_version_id} style={s.card}><Text style={s.body}>{ref.title} · {ref.purpose} · {ref.kind}{ref.unavailable_reason?' · 不可用':''}</Text><ListAction label={(media.includes(ref.asset_version_id)?'✓ ':'')+'使用参考 '+ref.title} secondary disabled={busy||!!ref.unavailable_reason} onPress={()=>setMedia(old=>toggle(old,ref.asset_version_id))}/></View>)}
 <Text selectable style={s.body}>提示词预览：{[prompt,...items.filter(i=>texts.includes(i.version_id)).map(i=>`[${i.kind}: ${i.title} / ${i.version_id}]\n${i.content}`)].join('\n\n')}</Text>
 {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}<ListAction label="按以上用途新建视频草稿" disabled={busy||!shot||!prompt.trim()} onPress={()=>{if(!shot||busy)return;setBusy(true);void creativeService().execute({name:'semantic.prepareVideo',payload:{projectId,shotId,expectedShotRevision:shot.revision,prompt,textVersions:texts,referenceVersions:media}},createId()).then(result=>{if(result.status==='completed')router.replace({pathname:'/creative-draft/[id]',params:{id:result.value.draftId}});}).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}/>
 </ScrollView></SafeAreaView>;
}
