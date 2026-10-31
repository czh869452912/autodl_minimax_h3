import {useState,useEffect} from 'react';
import {Image,Pressable,ScrollView,Text,View} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {AudioVersionPreview} from './AudioVersionPreview';
import {COLORS} from '../ui/theme';
import {IconAction,TextAction} from './WorkbenchUI';
type Reference={version_id:string;relative_path:string;mime:string;byte_size:number;state:string;blob_sha256:string};
export function VideoReferenceCards({active=true,kind,rows,minimum,maximum,editable,onAdd,onPreview,onReplace}:{active?:boolean;kind:'image'|'audio';rows:Reference[];minimum:number;maximum:number;editable:boolean;onAdd:()=>void;onPreview:(uri:string)=>void;onReplace:(ids:string[])=>void}){
 const [listening,setListening]=useState<string>();
 const [managed,setManaged]=useState<string>();
 useEffect(()=>{if(!active)setListening(undefined);},[active]);
 const label=kind==='image'?'参考图':'参考音频';
 const move=(index:number,delta:number)=>{const ids=rows.map(r=>r.version_id);[ids[index],ids[index+delta]]=[ids[index+delta],ids[index]];onReplace(ids);setManaged(undefined);};
 const card=(row:Reference,index:number)=>{
   const available=row.state==='AVAILABLE'&&Boolean(row.relative_path);
   const size=row.byte_size?(row.byte_size<1024*1024?`${Math.max(1,Math.round(row.byte_size/1024))} KB`:`${(row.byte_size/1024/1024).toFixed(1)} MB`):'';
   return <View key={row.version_id} style={{width:kind==='image'?128:undefined,borderWidth:1,borderColor:COLORS.border,borderRadius:12,overflow:'hidden',backgroundColor:COLORS.surface}}>
     {kind==='image'?<Pressable accessibilityRole="button" accessibilityLabel={`预览参考图 ${index+1}`} disabled={!available} onPress={()=>onPreview(`${FileSystem.documentDirectory}${row.relative_path}`)} style={{height:100,backgroundColor:COLORS.surfaceRaised,justifyContent:'center',alignItems:'center'}}>
       {available?<Image source={{uri:`${FileSystem.documentDirectory}${row.relative_path}`}} resizeMode="cover" style={{width:'100%',height:'100%'}}/>:<Text style={{color:COLORS.textMuted,fontSize:12}}>原文件待恢复</Text>}
     </Pressable>:null}
     <View style={{flexDirection:'row',alignItems:'center',paddingLeft:12,gap:4}}><View style={{flex:1,paddingVertical:8}}><Text style={{fontSize:13,fontWeight:'600',color:COLORS.text}}>{kind==='image'?'图片':'音频'} {index+1}</Text>{kind==='audio'?<Text style={{fontSize:11,color:COLORS.textMuted,marginTop:3}}>{available?[row.mime?.split('/')[1]?.toUpperCase(),size].filter(Boolean).join(' · '):'原文件待恢复'}</Text>:null}</View>
       {kind==='audio'?<TextAction label={listening===row.version_id?'收起试听':`试听音频 ${index+1}`} disabled={!available} onPress={()=>setListening(listening===row.version_id?undefined:row.version_id)}/>:null}
       <IconAction label={`管理${label} ${index+1}`} icon="more_horiz" disabled={!editable} selected={managed===row.version_id} onPress={()=>setManaged(managed===row.version_id?undefined:row.version_id)}/>
     </View>
     {editable&&managed===row.version_id?<View style={{paddingHorizontal:8,paddingBottom:8,gap:4}}>{index>0?<TextAction label="向前移动" onPress={()=>move(index,-1)}/>:null}{index<rows.length-1?<TextAction label="向后移动" onPress={()=>move(index,1)}/>:null}<TextAction label="移除引用" onPress={()=>{if(listening===row.version_id)setListening(undefined);setManaged(undefined);onReplace(rows.filter(r=>r.version_id!==row.version_id).map(r=>r.version_id));}}/></View>:null}
     {active&&kind==='audio'&&listening===row.version_id&&available?<View style={{padding:12,paddingTop:0}}><AudioVersionPreview version={{id:row.version_id,assetId:'',versionNo:1,source:'import',state:'AVAILABLE',relativePath:row.relative_path,mime:row.mime,blobSha256:row.blob_sha256,recipe:{}}}/></View>:null}
   </View>;
 };
 return <View style={{gap:8}}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><View><Text style={{fontSize:14,fontWeight:'600',color:COLORS.text}}>{label} <Text style={{fontSize:12,fontWeight:'400',color:COLORS.textMuted}}>{rows.length}/{maximum}{minimum===0?' · 可选':''}</Text></Text>{minimum>0?<Text style={{fontSize:11,color:COLORS.textMuted}}>至少 {minimum} 个</Text>:null}</View><TextAction label={`添加${label}`} disabled={!editable||rows.length>=maximum} onPress={onAdd}/></View>
   {rows.length?kind==='image'?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{rows.map(card)}</ScrollView>:<View style={{gap:8}}>{rows.map(card)}</View>:null}
 </View>;
}
