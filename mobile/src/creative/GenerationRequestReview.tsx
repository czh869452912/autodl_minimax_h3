import {useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {ParameterSheet} from './WorkbenchUI';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from './creativeUI';
import type {prepareCreativeImage} from './novelAiRuntime';
import type {prepareCreativeVideo} from './videoRuntime';

export type GenerationPreview=Awaited<ReturnType<typeof prepareCreativeImage>>|Awaited<ReturnType<typeof prepareCreativeVideo>>;
/** Display only reviewed fields. Never serialize request bodies containing media or credentials. */
export function GenerationRequestReview({preview,onClose,onConfirm,error,busy,projectTitle}:{preview:GenerationPreview;onClose:()=>void;onConfirm:()=>Promise<void>;error:string;busy:boolean;projectTitle?:string}){
 const [outbound,setOutbound]=useState(false),[spend,setSpend]=useState(false),lock=useRef(false);
 const image=preview.draft.provider_id==='novelai',snapshot=preview.prepared.inputSnapshot as Record<string,unknown>;
 const request=preview.prepared.requestInput as Record<string,any>,params=request.parameters??{};
 const specs=Object.entries({...snapshot,...(image?{model:request.model,width:params.width,height:params.height,steps:params.steps,seed:params.seed,samples:params.n_samples,sampler:params.sampler}: {})}).filter(([key,value])=>['model','resolution','duration','width','height','steps','seed','samples','sampler','operation'].includes(key)&&['string','number'].includes(typeof value));
 const field=(label:string,value:string)=><View key={label} style={{gap:6}}><Text accessibilityRole="header" style={s.title}>{label}</Text><Text selectable style={s.body}>{value||'（空）'}</Text></View>;
 const check=(label:string,value:boolean,set:(value:boolean)=>void)=><Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked:value,disabled:busy}} disabled={busy} onPress={()=>set(!value)} style={[s.card,{minHeight:48}]}><Text style={s.body}>{value?'已确认：':'待确认：'}{label}</Text></Pressable>;
 return <ParameterSheet title="核对生成请求" description="关闭只退出审阅，不会提交。" fullScreen onClose={()=>{if(!busy)onClose();}}>
  {field('本次对象',`${projectTitle??'当前项目'} · ${image?'图片':'视频'}草稿\n草稿标识 …${preview.draft.id.slice(-8)} · 修订 ${preview.draft.revision}`)}
  {field('生成服务与账号',`${image?'NovelAI':'AutoDL'} · 绑定标识 …${preview.account.account_binding_id.slice(-8)}\n凭据版本 …${preview.account.credential_generation_id.slice(-8)}\n${preview.account.identity_mode==='provider_verified'?'服务商已验证账号身份':'按凭据绑定，未声明服务商账号身份已验证'}`)}
  {field('发送内容',image?String(request.input??snapshot.prompt??''):String(request.prompt??snapshot.prompt??'请在草稿中核对工作流输入'))}
  {!image?field('工作流版本',`${preview.prepared.workflowId} · ${preview.prepared.workflowVersion}`):null}
  {image&&params.negative_prompt?field('负面描述',String(params.negative_prompt)):null}
  {image?(params.v4_prompt?.caption?.char_captions??[]).map((c:{char_caption:string},i:number)=>field(`角色 ${i+1}`,`${c.char_caption}\n负面：${params.v4_negative_prompt?.caption?.char_captions?.[i]?.char_caption??'（空）'}`)):null}
  {field('固定素材版本',preview.versionIds.length?preview.versionIds.join('\n'):'无参考素材，仅发送上述文字与生成参数。')}
  {field('本次规格',specs.map(([key,value])=>`${({model:'模型',resolution:'分辨率',duration:'时长（秒）',width:'宽',height:'高',steps:'步数',seed:'种子',samples:'图片张数',sampler:'采样器',operation:'操作'} as Record<string,string>)[key]}：${value}`).join('\n')||'由当前工作流固定')}
  {field('消费范围','仅此确切请求 1 次；从确认时起 15 分钟有效。图片张数按上述规格，不等于请求次数。费用未知，没有金额上限。更改输入或新请求需重新确认。网络结果不明不会自动重发。')}
  {field('分别确认许可','外发许可允许发送本请求的文字和所列素材；消费许可允许未知费用请求。勾选暂不写入，最终确认后才分别记录许可并入队。')}
  {check('允许本次文字与素材外发',outbound,setOutbound)}
  {check('接受未知费用，仅允许本请求一次',spend,setSpend)}
  {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  <ListAction label={busy?'正在提交，请等待':'确认许可并生成 1 次'} disabled={busy||!outbound||!spend} onPress={()=>{if(lock.current||!outbound||!spend)return;lock.current=true;void onConfirm().finally(()=>{lock.current=false;});}}/>
  <ListAction label="取消，返回本轮创作" secondary disabled={busy} onPress={onClose}/>
 </ParameterSheet>;
}
