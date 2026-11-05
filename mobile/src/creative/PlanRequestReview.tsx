import {Text,View} from 'react-native';
import {ParameterSheet} from './WorkbenchUI';
import {GenerationRequestDetails,RequestConsentActions,type GenerationPreview} from './GenerationRequestReview';
import {creativeUI as s} from './creativeUI';
export function PlanRequestReview({items,excluded,batch,onClose,onConfirm,busy,error}:{items:Array<{title:string;note?:string;preview:GenerationPreview}>;excluded:Array<{title:string;reason:string}>;batch:boolean;onClose:()=>void;onConfirm:()=>Promise<void>;busy:boolean;error:string}){
 return <ParameterSheet title={batch?'核对批次请求':'核对计划请求'} fullScreen description="关闭不授权；仅处理以下确切请求。" onClose={()=>{if(!busy)onClose();}}>
  <Text style={s.title}>本次 {items.length} 个视频请求</Text>
  <Text style={s.body}>每个请求仅 1 次，确认起 15 分钟有效。费用未知，无金额上限。授权后由计划继续提交，依赖与暂停规则仍生效；已发送任务不因暂停撤回。结果不明不自动重发。</Text>
  {excluded.length?<View style={s.card}><Text style={s.title}>本次未纳入 {excluded.length} 个镜头</Text>{excluded.map((x,i)=><Text key={i} style={s.body}>{x.title} · {x.reason}</Text>)}</View>:null}
  {items.map((x,i)=><View key={x.preview.draft.id} style={s.card}><Text style={s.title}>请求 {i+1} · {x.title}</Text><Text style={s.body}>{x.note}</Text><GenerationRequestDetails preview={x.preview} projectTitle={x.title}/></View>)}
  <RequestConsentActions count={items.length} busy={busy} error={error} onClose={onClose} onConfirm={onConfirm} cancelLabel="取消，返回计划" confirmLabel={`确认以上 ${items.length} 个请求的许可`}/>
 </ParameterSheet>;
}
