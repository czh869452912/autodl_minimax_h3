import {isNovelAiMedium,novelAiDraftInput,type NovelAiDraftInput} from './novelAiProtocol';
import type {NovelAiUsage} from './novelAiUsage';
export const ANLAS_RULES='novelai-web-32f2478-2026-10-26';
export type AnlasEstimate={status:'estimate';amount:number;paidWithoutAllowance:number;usesAllowance:boolean;rules:string}|{status:'unknown';reason:string};
/** Official public web checkStableDiffusionPrice. Display estimate only, never a budget upper bound. */
export function estimateAnlas(input:NovelAiDraftInput,usage:NovelAiUsage|undefined,now=Date.now(),operation?:string):AnlasEstimate{
 if(operation==='upscale'||operation==='enhance'||input.enhance||input.enhancement)return {status:'unknown',reason:'此增强或放大操作暂无法估算'};
 if(!novelAiDraftInput.safeParse(input).success)return {status:'unknown',reason:'请先完善生成参数'};
 if(!usage||now-usage.fetchedAt>60000||now<usage.fetchedAt)return {status:'unknown',reason:'用量状态待刷新'};
 const pixels=input.width*input.height,medium=isNovelAiMedium(input),steps=medium?14:input.steps,v5=input.model.startsWith('nai-diffusion-5');
 const strength=input.action==='infill'?input.inpaintStrength:input.action==='img2img'?input.strength:1;
 const base=Math.ceil(2.951823174884865e-6*pixels+5.753298233447344e-7*pixels*steps*(medium?1/1.06521739:1));
 const unit=Math.max(Math.ceil(base*(v5?1.5:1)*strength),2);
 if(unit>140)return {status:'unknown',reason:'费用超出已核验的计费范围'};
 const eligible=usage.active&&usage.tier>=3&&pixels<=1048576&&steps<=28;
 if(eligible&&v5&&!usage.limit)return {status:'unknown',reason:'订阅额度状态待刷新'};
 const usesAllowance=eligible&&(!v5||!usage.limit!.unavailable);
 return {status:'estimate',amount:unit*(input.samples-(usesAllowance?1:0)),paidWithoutAllowance:unit*input.samples,usesAllowance,rules:ANLAS_RULES};
}
export function anlasEstimateLabel(estimate:AnlasEstimate){return estimate.status==='unknown'?estimate.reason:estimate.usesAllowance?`预计 ${estimate.amount} Anlas · 使用订阅额度`:`预计 ≈ ${estimate.amount} Anlas`;}
