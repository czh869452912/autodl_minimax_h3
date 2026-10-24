import {useEffect,useState} from 'react';
import {NativeModules,Text,View} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import type {AssetVersion} from './types';
import {creativeFiles} from './runtime';
import {ParameterSheet,SectionHeading,TextAction} from './WorkbenchUI';
import {creativeUI as s} from './creativeUI';
export type CreativeImageInfo={width:number;height:number;bytes:number;mime:string;metadata:Record<string,string>;metadataError?:boolean};
export function imageMetadataFields(raw:Record<string,string>,recipe:Record<string,unknown>){
  let comment:Record<string,any>={};
  try{const value=JSON.parse(raw.Comment??'{}');if(value && typeof value==='object' && !Array.isArray(value))comment=value;}catch{/* Raw text remains available below. */}
  const input=recipe.input as Record<string,any>|undefined;
  const caption=comment.v4_prompt?.caption,negative=comment.v4_negative_prompt?.caption;
  return [
    ['模型',comment.model??raw.Source??input?.model],['Effort',input?.effort],
    ['正面提示词',caption?.base_caption??comment.prompt??raw.Description??input?.prompt],
    ['负面提示词',negative?.base_caption??comment.negative_prompt??comment.uc??input?.negative],
    ['Seed',comment.seed??input?.seed],['步数',comment.steps??input?.steps],['采样器',comment.sampler??input?.sampler],
    ['引导强度',comment.scale??input?.guidance],['Rescale',comment.cfg_rescale??input?.rescale],
    ['生成尺寸',comment.width && comment.height?`${comment.width} × ${comment.height}`:input?.width && input?.height?`${input.width} × ${input.height}`:undefined],
    ['角色',caption?.char_captions?.length?caption.char_captions:input?.characters?.length?input.characters:undefined],
    ['角色负面',negative?.char_captions?.length?negative.char_captions:undefined],
    ['来源软件',raw.Software],['来源任务',recipe.jobId],['处理',recipe.operation==='upscale'?'独立超分 · 2×':input?.enhancement?`Enhance · ${input.enhancement.scale==='max'?'Max':`${input.enhancement.scale}×`}`:input?.enhance?'最大画质增强':undefined],
    ['增强强度',input?.enhancement?input.strength:undefined],['增强噪声',input?.enhancement?input.noise:undefined],
  ].filter((row):row is [string,any]=>row[1]!==undefined && row[1]!==null && row[1]!=='').map(([label,value])=>({label,value:typeof value==='object'?JSON.stringify(value,null,2):String(value)}));
}
function MetadataSheet({version,onClose}:{version:AssetVersion;onClose:()=>void}){
  const [info,setInfo]=useState<CreativeImageInfo>(),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[rawOpen,setRawOpen]=useState(false),[detailsOpen,setDetailsOpen]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{let active=true;(async()=>{
    if(version.state!=='AVAILABLE' || !version.relativePath)throw new Error('原件待恢复，以下仅显示 App 已保存的记录');
    if((await creativeFiles().verify(version.id))?.state!=='AVAILABLE')throw new Error('原件缺失或校验失败，以下仅显示 App 已保存的记录');
    if(!NativeModules.AutoDLMedia?.readCreativeImageInfo)throw new Error('请安装新版 Android 应用以读取图片内嵌信息');
    const value=await NativeModules.AutoDLMedia.readCreativeImageInfo(`${FileSystem.documentDirectory}${version.relativePath}`);
    if(active)setInfo(value);
  })().catch(e=>{if(active)setError(e.message??'图片信息读取失败');}).finally(()=>{if(active)setLoaded(true);});return()=>{active=false;};},[version.id]);
  const raw=info && Object.keys(info.metadata).length?info.metadata:(version.recipe.raw as Record<string,string>|undefined)??{},fields=imageMetadataFields(raw,version.recipe);
  const copy=async(value:string)=>{try{await Clipboard.setStringAsync(value);setNotice('已复制');}catch{setNotice('复制失败，请重试');}};
  return <ParameterSheet fullScreen title="图片信息" description={`版本 ${version.versionNo} · 只读查看`} onClose={onClose}>
    {!loaded?<Text style={s.muted}>正在读取图片信息…</Text>:null}
    {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
    {info?.metadataError?<Text accessibilityRole="alert" style={s.error}>部分内嵌元数据无法可靠读取，以下保留文件信息与 App 保存的生成记录。</Text>:null}
    {notice?<Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text>:null}
    <SectionHeading title="文件信息" />
    {info?<Text selectable style={s.body}>{info.width} × {info.height} · {info.mime} · {(info.bytes/1024/1024).toFixed(2)} MB</Text>:<Text style={s.muted}>{version.mime??'格式未知'} · {version.state==='AVAILABLE'?'本地文件':'原件待恢复'}</Text>}
    <Text style={s.muted}>{info?'内嵌信息读取自当前原件；未内嵌的字段使用 App 生成记录补充。':'当前展示 App 中保存的元数据和生成记录。'}文件尺寸与生成时尺寸可能不同。</Text>
    <SectionHeading title="生成信息" />
    {fields.length?fields.filter(({label})=>detailsOpen || ['模型','Effort','生成尺寸','处理'].includes(label)).map(({label,value})=><View key={label} style={{gap:4}}><View style={s.row}><Text style={s.title}>{label}</Text><TextAction label={`复制${label}`} onPress={()=>void copy(value)} /></View><Text selectable style={s.body}>{value.length>12000?`${value.slice(0,12000)}\n…显示已截断，可复制完整内容。`:value}</Text></View>):<Text style={s.muted}>没有找到生成参数。图片仍可查看和超分。</Text>}
    <TextAction label={detailsOpen?'收起生成参数':'查看提示词与全部参数'} onPress={()=>setDetailsOpen(!detailsOpen)} />
    {Array.isArray(version.recipe.notices)?version.recipe.notices.map((n,i)=><Text key={i} style={s.muted}>{String(n)}</Text>):null}
    <TextAction label={rawOpen?'收起原始元数据':'查看原始元数据与配方'} onPress={()=>setRawOpen(!rawOpen)} />
    {rawOpen?<>{version.blobSha256?<><Text selectable style={s.muted}>SHA-256：{version.blobSha256}</Text><TextAction label="复制文件哈希" onPress={()=>void copy(version.blobSha256!)} /></>:null}<TextAction label="复制完整元数据与配方" onPress={()=>void copy(JSON.stringify({file:info?{width:info.width,height:info.height,mime:info.mime,bytes:info.bytes}:null,embedded:info?.metadata??null,recipe:version.recipe},null,2))} /><Text selectable style={s.muted}>{JSON.stringify({embedded:info?.metadata??null,recipe:version.recipe},null,2).slice(0,16000)}</Text><Text style={s.muted}>长记录在此显示前 16,000 字符，复制可获取完整内容。</Text></>:null}
  </ParameterSheet>;
}
export function ImageMetadataPanel({version,label="查看图片元数据"}:{version:AssetVersion;label?:string}){
  const [open,setOpen]=useState(false);
  return <><TextAction label={label} onPress={()=>setOpen(true)} />{open?<MetadataSheet key={version.id} version={version} onClose={()=>setOpen(false)} />:null}</>;
}
