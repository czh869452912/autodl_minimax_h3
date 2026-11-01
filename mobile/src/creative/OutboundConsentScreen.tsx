import {useEffect,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {getDatabase} from '../storage/databaseClient';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from './creativeUI';
export function OutboundConsentScreen(){
 const {projectId}=useLocalSearchParams<{projectId:string}>(),router=useRouter();
 const [rows,setRows]=useState<Array<{id:string;provider_id:string;manifest_json:string;expires_at:number;revoked_at:number|null;created_at:number}>>([]),[error,setError]=useState('');
 const [next,setNext]=useState<{createdAt:number;id:string}>();
 const refresh=async(after?:{createdAt:number;id:string})=>{const page=await getDatabase().getAllAsync<{id:string;provider_id:string;manifest_json:string;expires_at:number;revoked_at:number|null;created_at:number}>('SELECT * FROM creative_outbound_consents WHERE project_id=? AND (? IS NULL OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 31',projectId,after?.createdAt??null,after?.createdAt??null,after?.createdAt??null,after?.id??null);setRows(page.slice(0,30));setNext(page.length>30?{createdAt:page[29].created_at,id:page[29].id}:undefined);};
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[projectId]);
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={{padding:16,gap:12}}><ListAction label="返回项目" secondary onPress={()=>router.back()}/><Text style={s.title}>素材外发许可</Text><Text style={s.body}>撤销阻止尚未发送的请求；已发送到供应商的内容无法通过此操作收回。手动点击生成即确认该请求外发。以下记录绑定单个请求，不是时段内的通用授权；到期只阻止尚未发送的请求。</Text>{error?<Text style={s.error}>{error}</Text>:null}{rows.map(row=><View key={row.id} style={s.card}><Text selectable style={s.body}>{row.provider_id} · {JSON.parse(row.manifest_json).length ? JSON.parse(row.manifest_json).length + ' 个参考素材版本' : '仅提示词，无参考素材'} · {row.revoked_at?'已撤销':row.expires_at<=Date.now()?'已到期':'有效至 '+new Date(row.expires_at).toLocaleTimeString()}</Text>{!row.revoked_at&&row.expires_at>Date.now()?<ListAction label="撤销此许可" secondary onPress={()=>void getDatabase().runAsync('UPDATE creative_outbound_consents SET revoked_at=? WHERE id=? AND project_id=?',Date.now(),row.id,projectId).then(()=>refresh()).catch(e=>setError(e.message))}/>:null}</View>)}{next?<ListAction label="更早的外发许可" secondary onPress={()=>void refresh(next).catch(e=>setError(e.message))}/>:null}<ListAction label="最新外发许可" secondary onPress={()=>void refresh().catch(e=>setError(e.message))}/></ScrollView></SafeAreaView>;
}
