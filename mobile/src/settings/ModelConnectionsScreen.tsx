import {useEffect,useRef,useState} from 'react';
import {ScrollView,Text,TextInput,View,Switch} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRouter} from 'expo-router';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from '../creative/creativeUI';
import {useUnsavedChanges} from '../creative/useUnsavedChanges';
import {readLlmConnections,saveLlmConnection,selectLlmConnection,revokeLlmConnection,type LlmConnection} from './llmConnections';
export function ModelConnectionsScreen(){
 const router=useRouter(),lock=useRef(false);const [items,setItems]=useState<LlmConnection[]>([]),[active,setActive]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [title,setTitle]=useState(''),[endpoint,setEndpoint]=useState(''),[model,setModel]=useState(''),[apiKey,setApiKey]=useState(''),[images,setImages]=useState(false);
 useUnsavedChanges(Boolean(title||endpoint||model||apiKey),busy);
 const refresh=async()=>{const data=await readLlmConnections();setItems(data.items);setActive(data.active);};
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
 const work=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();await refresh();}catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{lock.current=false;setBusy(false);}};
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={{padding:16,gap:12}}><ListAction label="返回" secondary disabled={busy} onPress={()=>router.back()}/><Text style={s.title}>模型连接与输入能力</Text><Text style={s.body}>连接保存在设备安全存储，最多 8 项。启用只影响后续运行，不自动回退到其他连接；撤销会阻止该连接的后续请求。能力为用户声明，保存不调用模型、不验证远程身份。</Text>{error?<Text style={s.error}>{error}</Text>:null}
 {items.map(item=><View key={item.id} style={s.card}><Text style={s.title}>{item.title}{active===item.id?' · 当前':''}{item.revoked?' · 已撤销':''}</Text><Text selectable style={s.body}>{item.endpoint}{'\n'}{item.model} · 文本{item.images?'、图片':''}</Text>{!item.revoked?<><ListAction label="用于后续运行" disabled={busy} onPress={()=>void work(()=>selectLlmConnection(item.id))}/><ListAction label="撤销连接" secondary disabled={busy} onPress={()=>void work(()=>revokeLlmConnection(item.id))}/></>:null}</View>)}
 <ListAction label="使用设置页的原有连接" secondary disabled={busy} onPress={()=>void work(()=>selectLlmConnection(null))}/>
 <Text style={s.title}>新增 OpenAI 兼容连接</Text>{([['名称',title,setTitle],['HTTPS API 地址',endpoint,setEndpoint],['模型 ID',model,setModel],['API Key',apiKey,setApiKey]] as const).map(([label,value,set])=><TextInput key={label} accessibilityLabel={label} placeholder={label} editable={!busy} value={value} onChangeText={set} autoCapitalize="none" secureTextEntry={label==='API Key'} style={s.input}/>)}
 <View style={{flexDirection:'row',alignItems:'center'}}><Text style={s.body}>此模型支持图片输入</Text><Switch accessibilityLabel="声明模型支持图片" disabled={busy} value={images} onValueChange={setImages}/></View><ListAction label="保存连接（不发送请求）" disabled={busy} onPress={()=>void work(async()=>{await saveLlmConnection({title,endpoint,model,apiKey,images});setTitle('');setEndpoint('');setModel('');setApiKey('');setImages(false);})}/>
 </ScrollView></SafeAreaView>;
}
