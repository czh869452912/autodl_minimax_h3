import {useEffect,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {getDatabase} from '../storage/databaseClient';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from './creativeUI';
export function OutboundConsentScreen(){
 const {projectId}=useLocalSearchParams<{projectId:string}>(),router=useRouter();
 const [rows,setRows]=useState<Array<{id:string;provider_id:string;manifest_json:string;expires_at:number;revoked_at:number|null}>>([]),[error,setError]=useState('');
 const refresh=async()=>setRows(await getDatabase().getAllAsync('SELECT id,provider_id,manifest_json,expires_at,revoked_at FROM creative_outbound_consents WHERE project_id=? ORDER BY created_at DESC LIMIT 100',projectId));
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[projectId]);
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={{padding:16,gap:12}}><ListAction label="返回项目" secondary onPress={()=>router.back()}/><Text style={s.title}>素材外发许可</Text><Text style={s.body}>撤销阻止尚未发送的请求；已发送到供应商的内容无法通过此操作收回。消费授权与外发许可分别管理。</Text>{error?<Text style={s.error}>{error}</Text>:null}{rows.map(row=><View key={row.id} style={s.card}><Text selectable style={s.body}>{row.provider_id} · {JSON.parse(row.manifest_json).length} 个素材版本 · {row.revoked_at?'已撤销':row.expires_at<=Date.now()?'已到期':'有效至 '+new Date(row.expires_at).toLocaleTimeString()}</Text>{!row.revoked_at&&row.expires_at>Date.now()?<ListAction label="撤销此许可" secondary onPress={()=>void getDatabase().runAsync('UPDATE creative_outbound_consents SET revoked_at=? WHERE id=? AND project_id=?',Date.now(),row.id,projectId).then(refresh).catch(e=>setError(e.message))}/>:null}</View>)}</ScrollView></SafeAreaView>;
}
