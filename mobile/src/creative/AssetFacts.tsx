import {useEffect,useState} from 'react';
import {Image,Text,View} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type {AssetVersion,CreativeAsset} from './types';
import {COLORS} from '../ui/theme';
export function AssetFacts({asset,version,description,tags,projects}:{asset:CreativeAsset;version?:AssetVersion;description:string;tags:string;projects:string[]}){
 const [file,setFile]=useState<{bytes?:number;width?:number;height?:number}>({});
 useEffect(()=>{let live=true;setFile({});if(version?.state==='AVAILABLE'&&version.relativePath){const uri=FileSystem.documentDirectory+version.relativePath;
 void FileSystem.getInfoAsync(uri).then(info=>{if(live&&info.exists)setFile(old=>({...old,bytes:info.size}));}).catch(()=>undefined);
 if(version.mime?.startsWith('image/'))Image.getSize(uri,(width,height)=>{if(live)setFile(old=>({...old,width,height}));},()=>undefined);
 }return()=>{live=false;};},[version?.id,version?.state,version?.relativePath]);
 const bytes=file.bytes===undefined?'':file.bytes<1048576?`${(file.bytes/1024).toFixed(1)} KB`:`${(file.bytes/1048576).toFixed(1)} MB`;
 const facts=[['格式',version?.mime?.split('/')[1]?.toUpperCase()??asset.kind],['文件',version?.state==='AVAILABLE'?'本地可用':'待恢复'],...(bytes?[['大小',bytes]]:[]),...(file.width?[['尺寸',`${file.width} × ${file.height}`]]:[]),['来源',version?({import:'外部导入',generated:'生成',authored:'手工创建'})[version.source]:'暂无版本'],['创建',new Date(asset.createdAt).toLocaleDateString('zh-CN')]];
 return <View style={{gap:12}}><View style={{flexDirection:'row',flexWrap:'wrap',rowGap:10}}>{facts.map(([label,value])=><View key={label} style={{width:'50%',gap:3}}><Text style={{fontSize:11,color:COLORS.textMuted}}>{label}</Text><Text selectable style={{fontSize:13,color:COLORS.text}}>{value}</Text></View>)}</View>
 {description?<Text selectable style={{fontSize:14,lineHeight:21,color:COLORS.text}}>{description}</Text>:null}
 {tags?<View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{tags.split(/[,，]/).map(t=>t.trim()).filter(Boolean).map((tag,i)=><View key={i} style={{backgroundColor:COLORS.surfaceRaised,paddingHorizontal:9,paddingVertical:4,borderRadius:6}}><Text style={{fontSize:12,color:COLORS.textMuted}}>#{tag}</Text></View>)}</View>:null}
 <Text style={{fontSize:12,color:COLORS.textMuted}}>项目 · {projects.length?projects.join('、'):'未加入项目'}</Text></View>;
}
