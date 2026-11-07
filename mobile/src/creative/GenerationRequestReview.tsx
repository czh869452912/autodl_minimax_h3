import CryptoJS from 'crypto-js';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {ParameterSheet} from './WorkbenchUI';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from './creativeUI';
import type {prepareCreativeImage} from './novelAiRuntime';
import type {prepareCreativeVideo} from './videoRuntime';

export const generationReviewIdentity=(preview:GenerationPreview)=>CryptoJS.SHA256(JSON.stringify([preview.draft.id,preview.draft.revision,preview.draft.project_id,preview.account,preview.prepared,preview.versionIds])).toString();
export type GenerationPreview=Awaited<ReturnType<typeof prepareCreativeImage>>|Awaited<ReturnType<typeof prepareCreativeVideo>>;
export function GenerationRequestReview({preview,onClose,onConfirm,error,busy,projectTitle}:{preview:GenerationPreview;onClose:()=>void;onConfirm:()=>Promise<void>;error:string;busy:boolean;projectTitle?:string}){
 const identity=useMemo(()=>generationReviewIdentity(preview),[preview]);
 return <ParameterSheet title="核对生成请求" description="关闭只退出审阅，不会提交。" fullScreen onClose={()=>{if(!busy)onClose();}}>
  <GenerationRequestDetails preview={preview} projectTitle={projectTitle}/>
  <RequestConsentActions key={identity} onConfirm={onConfirm} onClose={onClose} error={error} busy={busy}/>
 </ParameterSheet>;
}
export function GenerationRequestDetails({preview,projectTitle}:{preview:GenerationPreview;projectTitle?:string}){
 const [technical,setTechnical]=useState(false),[materials,setMaterials]=useState<Record<string,{title:string;version_no:number}>>({});
 useEffect(()=>{
  let live=true;setMaterials({});setTechnical(false);
  if(preview.versionIds.length&&typeof preview.db?.getAllAsync==='function'){
   void preview.db.getAllAsync<{id:string;title:string;version_no:number}>(`SELECT v.id,a.title,v.version_no FROM creative_asset_versions v JOIN creative_assets a ON a.id=v.asset_id WHERE v.id IN (${preview.versionIds.map(()=>'?').join(',')})`,...preview.versionIds).then(rows=>{if(live)setMaterials(Object.fromEntries(rows.map(row=>[row.id,row])));}).catch(()=>{/* exact identities remain available in evidence */});
  }
  return()=>{live=false;};
 },[preview]);
 const image=preview.draft.provider_id==='novelai',snapshot=preview.prepared.inputSnapshot as Record<string,unknown>;
 const request=preview.prepared.requestInput as Record<string,any>,params=request.parameters??{};
 const actualImageSpecs=Object.fromEntries(Object.entries({model:request.model,width:params.width,height:params.height,steps:params.steps,seed:params.seed,samples:params.n_samples,sampler:params.sampler,operation:request.action}).filter(([,value])=>value!==undefined));
 const specs=Object.entries({...snapshot,...(image?actualImageSpecs:{})}).filter(([key,value])=>['model','resolution','duration','width','height','steps','seed','samples','sampler','operation'].includes(key)&&['string','number'].includes(typeof value));
 const imageParameters:Record<string,string>={scale:'提示词引导',cfg_rescale:'引导重缩放',noise_schedule:'噪声计划',strength:'底图变化强度',noise:'底图噪声',extra_noise_seed:'额外噪声种子',add_original_image:'保留原图内容',upscaled_enhance:'最大画质增强',straight_alpha:'直通透明通道',tag_hint_transparent_background:'透明背景',color_correct:'颜色校正'};
 const readable=(value:unknown)=>typeof value==='boolean'?(value?'是':'否'):String(value);
 const field=(label:string,value:string)=><View key={label} style={{gap:6}}><Text accessibilityRole="header" style={s.title}>{label}</Text><Text selectable style={s.body}>{value||'（空）'}</Text></View>;
 return <View style={{gap:16}}>
  {field('本次对象',`${projectTitle??'当前项目'} · ${image?'图片':'视频'}草稿 · 修订 ${preview.draft.revision}`)}
  {field('生成服务与账号',`${image?'NovelAI':'AutoDL'} · 绑定标识 …${preview.account.account_binding_id.slice(-8)}\n${preview.account.identity_mode==='provider_verified'?'服务商已验证账号身份':'按凭据绑定，未声明服务商账号身份已验证'}`)}
  <View style={s.card}><Text style={s.title}>1 次请求 · 费用未知，没有金额上限</Text><Text style={s.body}>确认后 15 分钟内有效。图片张数另计；修改输入、版本或账号后需要重新核对。结果不明时查询原任务，不自动重发。</Text></View>
  {field('发送内容',image?(snapshot.operation==='upscale'?'仅发送固定原图与超分参数，不发送提示词。':String(request.input??snapshot.prompt??'')):String(request.prompt??snapshot.prompt??'请在草稿中核对工作流输入'))}
  {image&&params.negative_prompt?field('负面描述',String(params.negative_prompt)):null}
  {image?(params.v4_prompt?.caption?.char_captions??[]).map((c:{char_caption:string;centers?:Array<{x:number;y:number}>},i:number)=>field(`角色 ${i+1}`,`${c.char_caption}\n负面：${params.v4_negative_prompt?.caption?.char_captions?.[i]?.char_caption??'（空）'}\n按坐标定位：${readable(!!params.v4_prompt?.use_coords)}${params.v4_prompt?.use_coords?' · '+(c.centers??[]).map(point=>`(${point.x}, ${point.y})`).join('、'):''}`)):null}
  {field('固定素材版本',preview.versionIds.length?preview.versionIds.map((id,index)=>materials[id]?`${index+1}. ${materials[id].title} · 版本 ${materials[id].version_no}`:`${index+1}. 固定参考素材 · 名称不可用（可展开版本证据核对）`).join('\n'):'无参考素材，仅发送上述文字与生成参数。')}
  {field('本次规格',specs.map(([key,value])=>`${({model:'模型',resolution:'分辨率',duration:'时长（秒）',width:'宽',height:'高',steps:'步数',seed:'种子',samples:'图片张数',sampler:'采样器',operation:'操作'} as Record<string,string>)[key]}：${value}`).join('\n')||'由当前工作流固定')}
  {image&&Object.keys(params).length?field('图片处理参数',Object.entries(imageParameters).filter(([key])=>['string','number','boolean'].includes(typeof params[key])).map(([key,label])=>`${label}：${readable(params[key])}`).concat(typeof params.img2img?.strength==='number'?[`重绘内图生图强度：${params.img2img.strength}`]:[]).join('\n')):null}
  {image&&request.action==='infill'?field('重绘蒙版',typeof snapshot.maskVersionId==='string'?'使用已固定的素材蒙版；确切身份见版本证据。':`使用草稿中已审阅的绘制蒙版 · ${Array.isArray(snapshot.maskStrokes)?snapshot.maskStrokes.length:0} 条笔画；像素随本次请求发送。`):null}
  {image&&snapshot.operation==='upscale'?field('超分输出',`倍率：${snapshot.factor}\n输出尺寸：${Number(snapshot.width)*Number(snapshot.factor)} × ${Number(snapshot.height)*Number(snapshot.factor)}\n图片张数：1`):null}
  <ListAction label={technical?'收起技术证据':'查看版本与技术证据'} secondary onPress={()=>setTechnical(!technical)}/>
  {technical?<View style={{gap:16}}>
    {field('草稿与账号版本',`草稿：${preview.draft.id} · 修订 ${preview.draft.revision}\n账号绑定：${preview.account.account_binding_id}\n凭据版本：${preview.account.credential_generation_id}`)}
    {field('确切素材版本',preview.versionIds.join('\n')||'无参考素材')}
  {!image?field('完整工作流输入',JSON.stringify(snapshot,(key,value)=>['uri','base64','data'].includes(key)?undefined:value,2)):null}
  {!image?field('工作流版本',`${preview.prepared.workflowId} · ${preview.prepared.workflowVersion}`):null}
  </View>:null}
 </View>;
}
export function RequestConsentActions({onClose,onConfirm,error,busy,count=1,cancelLabel='取消，返回本轮创作',confirmLabel='确认许可并生成 1 次'}:{onClose:()=>void;onConfirm:()=>Promise<void>;error:string;busy:boolean;count?:number;cancelLabel?:string;confirmLabel?:string}){
 const [outbound,setOutbound]=useState(false),[spend,setSpend]=useState(false),lock=useRef(false);
 const check=(label:string,value:boolean,set:(value:boolean)=>void)=><Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked:value,disabled:busy}} disabled={busy} onPress={()=>set(!value)} style={[s.card,{minHeight:48}]}><Text style={s.body}>{value?'已确认：':'待确认：'}{label}</Text></Pressable>;
 return <View style={{gap:16}}>
  <Text style={s.title}>分别确认许可</Text>
  <Text style={s.body}>外发许可允许发送以上 {count} 个确切请求的文字和所列素材；消费许可允许未知费用请求。勾选暂不写入，最终确认后分别记录。不会授权列表之外的新请求。</Text>
  {check('允许本次文字与素材外发',outbound,setOutbound)}
  {check(count===1?'接受未知费用，仅允许本请求一次':`接受未知费用，以上 ${count} 个请求各限一次`,spend,setSpend)}
  {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  <ListAction label={busy?'正在提交，请等待':confirmLabel} disabled={busy||!outbound||!spend} onPress={()=>{if(lock.current||busy||!outbound||!spend)return;lock.current=true;void onConfirm().finally(()=>{lock.current=false;});}}/>
  <ListAction label={cancelLabel} secondary disabled={busy} onPress={onClose}/>
 </View>;
}
