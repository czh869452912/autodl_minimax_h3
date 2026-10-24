import { creativeService } from './runtime';
import type { CreativeDraft } from './drafts';
import type { NovelAiDraftInput } from './novelAiProtocol';
import {videoDraftInput} from './drafts';
import type {z} from 'zod';
import { createId } from '../ids';

/** Fork immutable submissions internally so repeat generation stays on the canvas. */
export async function persistImageWorkbenchInput(draft:CreativeDraft,input:NovelAiDraftInput,onDraft:(draft:CreativeDraft)=>void,fromVersionId?:string) {
  return persistWorkbenchInput(draft,input,onDraft,fromVersionId);
}
export async function persistVideoWorkbenchInput(draft:CreativeDraft,input:z.output<typeof videoDraftInput>,onDraft:(draft:CreativeDraft)=>void){
  return persistWorkbenchInput(draft,input,onDraft);
}
async function persistWorkbenchInput(draft:CreativeDraft,input:NovelAiDraftInput|z.output<typeof videoDraftInput>,onDraft:(draft:CreativeDraft)=>void,fromVersionId?:string){
  const service=creativeService();
  let row=await service.draft(draft.id);
  if(!row || row.revision!==draft.revision || row.state!==draft.state)throw new Error('草稿已在其他入口更新，请先载入最新内容');
  const upscale=JSON.parse(row.input_json).operation==='upscale';
  if(row.state==='SUBMITTED' || upscale) {
    const result=await service.execute(upscale
      ? {name:'draft.createImage',payload:{input:input as NovelAiDraftInput,fromVersionId,projectId:row.project_id??undefined,shotId:row.shot_id??undefined}}
      : {name:'draft.copySubmitted',payload:{id:row.id}},createId());
    if(result.status!=='completed')throw new Error('无法准备下一次生成');
    row=await service.draft(result.value.draftId);
    if(!row)throw new Error('新草稿读取失败');
    onDraft(row);
  }
  if(row.state!=='EDITING')throw new Error('图片草稿不可编辑');
  if(row.input_json!==JSON.stringify(input)) {
    await service.execute(row.provider_id==='novelai'?{name:'draft.updateImage',payload:{id:row.id,expectedRevision:row.revision,input:input as NovelAiDraftInput}}:{name:'draft.updateVideo',payload:{id:row.id,expectedRevision:row.revision,input:input as z.output<typeof videoDraftInput>}},createId());
    row=await service.draft(row.id);
    if(!row)throw new Error('草稿保存后读取失败');
  }
  onDraft(row);
  return row;
}
