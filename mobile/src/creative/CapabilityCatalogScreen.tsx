import {useEffect,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRouter} from 'expo-router';
import {getDatabase} from '../storage/databaseClient';
import {readCapabilityCatalog,type Capability} from './capabilityCatalog';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from './creativeUI';
export function CapabilityCatalogScreen(){
 const router=useRouter(),[after,setAfter]=useState(''),[items,setItems]=useState<Capability[]>([]),[next,setNext]=useState<string>(),[error,setError]=useState('');
 useEffect(()=>{let active=true;setError('');void readCapabilityCatalog(getDatabase(),after).then(page=>{if(active){setItems(page.items);setNext(page.next);}}).catch(e=>{if(active){setItems([]);setNext(undefined);setError(e.message);}});return()=>{active=false;};},[after]);
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={{padding:16,gap:12}}>
  <ListAction label="返回项目" secondary onPress={()=>router.back()}/><Text style={s.title}>制作能力</Text>
  <Text style={s.body}>以下来自已安装工作流和本地账号状态。不会发送素材或请求生成；实际请求仍需准备、核验并授权。不会自动切换服务。</Text>
  <ListAction label="模型连接与输入能力" secondary onPress={()=>router.push('/model-connections')}/>
  {error?<Text accessibilityRole="alert" style={s.body}>{error}</Text>:null}
  {items.map(item=><View key={item.id} style={s.card}><Text style={s.title}>{item.title}</Text><Text selectable style={s.body}>{item.provider} · {item.version}{'\n'}输出：{item.outputs.join('、')}{'\n'}{item.models.join('、')}{'\n'}{item.reasons.length?item.reasons.map(r=>({ACCOUNT_NOT_BOUND:'尚未连接账号',WORKFLOW_INVALID:'工作流损坏或活动版本不一致',ADAPTER_UNAVAILABLE:'应用不支持此适配器',OPERATION_UNSUPPORTED:'应用不支持此操作',ADAPTER_VERSION_MISMATCH:'适配器版本不匹配'}[r]??r)).join('；'):'本地配置可用，尚未验证远程身份'}</Text><ListAction label={item.configuration==='workflow'?'管理工作流':'连接账号'} secondary onPress={()=>router.push({pathname:'/settings-panel',params:{section:item.configuration==='workflow'?'workflows':'accounts'}})}/></View>)}
  {next?<ListAction label="更多能力" onPress={()=>setAfter(next)}/>:null}{after?<ListAction label="回到第一页" secondary onPress={()=>setAfter('')}/>:null}
 </ScrollView></SafeAreaView>;
}
