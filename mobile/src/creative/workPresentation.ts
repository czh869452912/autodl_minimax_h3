import type {CreativeDraft} from './drafts';
import type {CreativeShot} from './story';
/** Read-only presentation: creating a draft never changes an adopted stage. */
export function shotStage(shot:CreativeShot) {
  if (shot.selected_video) return {kind:'review' as const,label:'审阅视频成果'};
  if (shot.selected_image) return shot.image_state === 'AVAILABLE'
    ? {kind:'video' as const,label:'制作视频'} : {kind:'restore' as const,label:'恢复参考图原件'};
  return {kind:'image' as const,label:'选择参考图'};
}
export function draftPresentation(draft:CreativeDraft) {
  let input:Record<string,unknown>={};try{input=JSON.parse(draft.input_json);}catch{/* Preserve access to damaged drafts. */}
  const media=draft.provider_id==='novelai'?'图片':'视频';
  const values=input.values as Record<string,unknown>|undefined;
  const rawPrompt=input.prompt??values?.prompt;
  const prompt=typeof rawPrompt==='string'?rawPrompt.trim():'';
  return {title:prompt || (input.operation==='upscale'?'图片清晰放大':media+'草稿')+' · '+draft.id.slice(-8),
    media,state:draft.state==='SUBMITTED'?'已提交 · 查看进度与候选':draft.state==='EDITING'?'编辑中':'已丢弃',
    updated:draft.updated_at?new Date(draft.updated_at).toLocaleString():'更新时间未知',
    pathname:draft.provider_id==='novelai'?'/image-draft/[id]' as const:'/creative-draft/[id]' as const};
}
