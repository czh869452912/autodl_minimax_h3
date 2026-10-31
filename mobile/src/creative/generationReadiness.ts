export type ReadyState = {kind:'submitting'|'unknown'|'pending'|'connection'|'description'|'checking'|'ready'; label:string; canSubmit:boolean};
export function generationReadiness(input:{provider:'NovelAI'|'AutoDL';busy:boolean;pending:boolean;unknown:boolean;connected:boolean|undefined;missingPrompt:boolean;usagePending?:boolean}):ReadyState {
  if(input.busy)return {kind:'submitting',label:'正在提交，请勿重复操作',canSubmit:false};
  if(input.pending)return {kind:input.unknown?'unknown':'pending',label:input.unknown?'结果未知，请先核查原任务':'任务正在生成',canSubmit:false};
  if(input.connected===undefined)return {kind:'checking',label:'正在读取服务连接',canSubmit:false};
  if(!input.connected)return {kind:'connection',label:'连接 '+input.provider+' 创作服务',canSubmit:false};
  if(input.missingPrompt)return {kind:'description',label:'补充画面描述后生成',canSubmit:false};
  if(input.usagePending)return {kind:'checking',label:'用量待核查，提交前仍需费用确认',canSubmit:true};
  return {kind:'ready',label:'可生成 · 提交前确认本次费用与授权',canSubmit:true};
}
