import {COLORS} from '../ui/theme';
import {useEffect,useState} from 'react';
import {Image,NativeModules,Platform,Pressable,Text,View} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import type {AssetVersion} from './types';
import {creativeFiles} from './runtime';
import {ParameterSheet,SectionHeading,SegmentedChoices,TextAction} from './WorkbenchUI';
import {creativeUI as s} from './creativeUI';
import {novelAiDraftInput,type NovelAiDraftInput} from './novelAiProtocol';
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
    ['Seed',comment.seed??(recipe.output as {seed?:number}|undefined)?.seed??input?.seed],['步数',comment.steps??input?.steps],['采样器',(comment.sampler??input?.sampler)?`${comment.sampler??input?.sampler}${(comment.noise_schedule??input?.noiseSchedule)?` (${comment.noise_schedule??input?.noiseSchedule})`:''}`:undefined],
    ['Sample 数量',comment.n_samples??input?.samples],['负面内容强度',comment.uncond_scale],
    ['引导强度',comment.scale??input?.guidance],['Rescale',comment.cfg_rescale??input?.rescale],
    ['生成尺寸',comment.width && comment.height?`${comment.width} × ${comment.height}`:input?.width && input?.height?`${input.width} × ${input.height}`:undefined],
    ['角色',caption?.char_captions?.length?caption.char_captions:input?.characters?.length?input.characters:undefined],
    ['角色负面',negative?.char_captions?.length?negative.char_captions:undefined],
    ['来源软件',raw.Software],['来源任务',recipe.jobId],['处理',recipe.operation==='upscale'?'独立超分 · 2×':input?.enhancement?`Enhance · ${input.enhancement.scale==='max'?'Max':`${input.enhancement.scale}×`}`:input?.enhance?'最大画质增强':undefined],
    ['增强强度',input?.enhancement?input.strength:undefined],['增强噪声',input?.enhancement?input.noise:undefined],
  ].filter((row):row is [string,any]=>row[1]!==undefined && row[1]!==null && row[1]!=='').map(([label,value])=>({label,value:typeof value==='object'?JSON.stringify(value,null,2):String(value)}));
}
function MetadataSheet({version,onClose,onReuse}:{version:AssetVersion;onClose:()=>void;onReuse?:(patch:Partial<NovelAiDraftInput>)=>void}){
  const [info,setInfo]=useState<CreativeImageInfo>(),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[rawOpen,setRawOpen]=useState(false),[tab,setTab]=useState('simplified'),[expandedRaw,setExpandedRaw]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{let active=true;(async()=>{
    if(version.state!=='AVAILABLE' || !version.relativePath)throw new Error('原件待恢复，以下仅显示 App 已保存的记录');
    if((await creativeFiles().verify(version.id))?.state!=='AVAILABLE')throw new Error('原件缺失或校验失败，以下仅显示 App 已保存的记录');
    if(!NativeModules.AutoDLMedia?.readCreativeImageInfo)throw new Error('请安装新版 Android 应用以读取图片内嵌信息');
    const value=await NativeModules.AutoDLMedia.readCreativeImageInfo(`${FileSystem.documentDirectory}${version.relativePath}`);
    if(active)setInfo(value);
  })().catch(e=>{if(active)setError(e.message??'图片信息读取失败');}).finally(()=>{if(active)setLoaded(true);});return()=>{active=false;};},[version.id]);
  const raw=info?info.metadata:(version.recipe.raw as Record<string,string>|undefined)??{},fields=imageMetadataFields(raw,version.recipe);
  const parsed=novelAiDraftInput.safeParse(version.recipe.input),prompt=fields.find(f=>f.label==='正面提示词')?.value;
  const seedText=fields.find(f=>f.label==='Seed')?.value,seed=seedText!==undefined?Number(seedText):undefined;
  const reuse=(patch:Partial<NovelAiDraftInput>)=>{onReuse?.(patch);onClose();};
  const copy=async(value:string)=>{try{await Clipboard.setStringAsync(value);setNotice('已复制');}catch{setNotice('复制失败，请重试');}};
  const rawComment=raw.Comment;
  let parameterText=rawComment??'',validJson=false;
  let comment:Record<string,any>={};
  try{const v=JSON.parse(rawComment??'{}');if(v&&typeof v==='object'&&!Array.isArray(v))comment=v;if(rawComment){parameterText=JSON.stringify(v,null,2);validJson=true;}}catch{}
  const request=comment.request_type??(version.recipe.input as any)?.action;
  const requestLabel=({PromptGenerateRequest:'Text to Image',Img2ImgRequest:'Image to Image',InfillRequest:'Inpainting',generate:'Text to Image',img2img:'Image to Image',infill:'Inpainting'} as Record<string,string>)[request]??request;
  const row=(label:string,value:string,copyLabel=label)=><View key={label} style={{flexDirection:'row',alignItems:'flex-start',paddingVertical:8,gap:10,borderBottomWidth:0.5,borderBottomColor:COLORS.border}}><Text style={{width:106,fontSize:12,fontWeight:'600',color:COLORS.textMuted}}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={`复制${copyLabel}`} onPress={()=>void copy(value)} style={{flex:1}}><Text selectable style={{fontSize:13,lineHeight:20,color:COLORS.text}}>{value.length>12000?value.slice(0,12000)+'\n…点击复制完整内容':value}</Text></Pressable></View>;
  const longLabels=['正面提示词','负面提示词','角色','角色负面'];
  return <ParameterSheet fullScreen title="图片信息 · Inspect" description={`版本 ${version.versionNo}`} onClose={onClose}>
    {version.state==='AVAILABLE' && version.relativePath?<Image accessibilityLabel="元数据对应图片" source={{uri:`${FileSystem.documentDirectory}${version.relativePath}`}} resizeMode="contain" style={{width:'100%',height:220,borderRadius:10,backgroundColor:COLORS.mediaBackground}}/>:null}
    {!loaded?<Text style={s.muted}>正在读取图片信息…</Text>:null}
    {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
    {info?.metadataError?<Text accessibilityRole="alert" style={s.error}>部分内嵌元数据读取失败，应用记录仅作为补充。</Text>:null}
    {notice?<Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text>:null}
    <View>
      {raw.Title?row('Title',raw.Title):null}
      {raw.Description?row('Description',raw.Description):null}
      {raw.Software?row('Software',raw.Software):null}
      {raw.Source?row('Source',raw.Source):null}
      {requestLabel?row('Request Type',String(requestLabel)):null}
      {info?row('File',`${info.width} × ${info.height} · ${info.mime} · ${(info.bytes/1024/1024).toFixed(2)} MB`):row('File',version.mime??'原件待恢复')}
    </View>
    <Text style={{fontSize:11,lineHeight:17,color:COLORS.textMuted}}>{info && Object.keys(info.metadata).length?'读取自当前原件；缺失字段由应用记录补充。':'当前仅有应用保存的记录。'}文件尺寸与生成尺寸可能不同；未在此验证数字签名。</Text>
    <SegmentedChoices singleRow label="元数据展示方式" options={[{id:'simplified',label:'Simplified'},{id:'raw',label:'Raw Parameters'}]} value={tab} onChange={setTab}/>
    {tab==='simplified'?<View style={{padding:12,borderRadius:10,backgroundColor:COLORS.surfaceRaised,gap:10}}>
      {longLabels.map(label=>{const field=fields.find(f=>f.label===label);return field?<View key={label} style={{gap:6}}><View style={s.row}><Text style={{fontSize:13,fontWeight:'600',color:COLORS.text}}>{({正面提示词:'Prompt',负面提示词:'Undesired Content',角色:'Characters',角色负面:'Character Undesired Content'} as Record<string,string>)[label]}</Text><TextAction label={`复制${label}`} onPress={()=>void copy(field.value)}/></View><Text selectable style={{color:COLORS.text,fontSize:13,lineHeight:21,fontStyle:label.includes('提示词')?'italic':'normal'}}>{field.value.slice(0,12000)}</Text></View>:null;})}
      {fields.filter(f=>!longLabels.includes(f.label)).map(f=>row(({采样器:'Sampler',步数:'Steps',生成尺寸:'Resolution',引导强度:'Prompt Guidance',Rescale:'Guidance Rescale',负面内容强度:'UC Strength','Sample 数量':'Samples'} as Record<string,string>)[f.label]??f.label,f.value,f.label))}
      {!fields.length?<Text style={s.muted}>没有找到生成参数。</Text>:null}
    </View>:<View style={{padding:12,borderRadius:10,backgroundColor:COLORS.surfaceRaised,gap:8}}>
      <View style={s.row}><Text style={{color:COLORS.text,fontWeight:'600'}}>Comment · Raw Parameters</Text>{rawComment!==undefined?<TextAction label="复制原始参数" onPress={()=>void copy(rawComment)}/>:null}</View>
      {!rawComment?<Text style={s.muted}>原件未包含 Comment 参数；应用配方可在下方单独查看。</Text>:<><Text selectable style={{fontFamily:Platform.OS==='ios'?'Menlo':'monospace',fontSize:12,lineHeight:19,color:COLORS.text}}>{expandedRaw?parameterText:parameterText.slice(0,16000)}</Text>{!validJson?<Text style={s.muted}>不是有效 JSON，保留原始文本。</Text>:null}{parameterText.length>16000?<TextAction label={expandedRaw?'收起长参数':'展开完整参数'} onPress={()=>setExpandedRaw(!expandedRaw)}/>:null}</>}
    </View>}
    {onReuse?<View style={{gap:4}}><SectionHeading title="复用到下一次创作"/><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{prompt!==undefined?<TextAction label="仅复用提示词" onPress={()=>reuse({prompt})}/>:null}{seed!==undefined&&Number.isInteger(seed)&&seed>=0&&seed<=4294967295?<TextAction label="仅复用 Seed" onPress={()=>reuse({seed})}/>:null}{parsed.success?<TextAction label="复用完整配置" onPress={()=>reuse({...parsed.data,...(parsed.data.enhancement||parsed.data.enhance?{action:'generate' as const,enhance:false,enhancement:null,sourceVersionId:null,maskVersionId:null,maskStrokes:[]}:{}),...(seed!==undefined&&Number.isInteger(seed)&&seed>=0&&seed<=4294967295?{seed}:{})})}/>:null}</View></View>:null}
    {Array.isArray(version.recipe.notices)?version.recipe.notices.map((n,i)=><Text key={i} style={s.muted}>{String(n)}</Text>):null}
    <TextAction label={rawOpen?'收起原始元数据':'查看原始元数据与配方'} onPress={()=>setRawOpen(!rawOpen)}/>
    {rawOpen?<View style={{gap:8}}><Text style={s.muted}>应用记录 · 与上方文件原始参数分开保存</Text>{version.blobSha256?row('SHA-256',version.blobSha256,'文件哈希'):null}<TextAction label="复制完整元数据与配方" onPress={()=>void copy(JSON.stringify({file:info?{width:info.width,height:info.height,mime:info.mime,bytes:info.bytes}:null,embedded:info?.metadata??null,recipe:version.recipe},null,2))}/><Text selectable style={{fontFamily:'monospace',fontSize:12,lineHeight:18,color:COLORS.textMuted}}>{JSON.stringify({embedded:info?.metadata??null,recipe:version.recipe},null,2).slice(0,16000)}</Text><Text style={s.muted}>此处最多显示 16,000 字符，可复制完整记录。</Text></View>:null}
  </ParameterSheet>;
}
export function ImageMetadataPanel({version,label="查看图片元数据",onReuse}:{version:AssetVersion;label?:string;onReuse?:(patch:Partial<NovelAiDraftInput>)=>void}){
  const [open,setOpen]=useState(false);
  return <><TextAction label={label} onPress={()=>setOpen(true)} />{open?<MetadataSheet key={version.id} version={version} onClose={()=>setOpen(false)} onReuse={onReuse} />:null}</>;
}
