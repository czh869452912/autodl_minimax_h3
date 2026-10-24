import { defaultNovelAiDraft, novelAiDraftInput, NOVELAI_MODELS } from './novelAiProtocol';
export function recoverNovelAiMetadata(raw: Record<string,string>) {
  if(JSON.stringify(raw).length>512*1024)throw new Error('METADATA_TOO_LARGE');
  let comment:Record<string,any>;
  try{comment=JSON.parse(raw.Comment??'{}');}catch{return {raw,notices:['生成参数不是有效 JSON，未恢复。']};}
  if(!comment||typeof comment!=='object'||Array.isArray(comment))return {raw,notices:['生成参数格式无法识别。']};
  if(!raw.Software?.includes('NovelAI') && !comment.v4_prompt && !comment.model)return {raw,notices:['未找到可确认的 NovelAI 参数；不能完整恢复提示词。']};
  const notices:string[]=[];
  const modelId=String(comment.model??raw.Source??'').replace(/-inpainting$/,'');
  const medium=modelId==='nai-diffusion-5-full-medium' || /NovelAI Diffusion V5 70AB5786/i.test(raw.Source??'');
  const model=NOVELAI_MODELS.find(m=>modelId===m) ?? (modelId==='nai-diffusion-5-full-medium' || /NovelAI Diffusion V5 (?:0ADF9AB7|70AB5786)/i.test(raw.Source??'') ? 'nai-diffusion-5-full' : undefined);
  if(!model)notices.push('原模型标识不可确认，草稿采用 V5 Full；请核对后生成。');
  const positive=comment.v4_prompt?.caption,negative=comment.v4_negative_prompt?.caption;
  const chars=Array.isArray(positive?.char_captions)?positive.char_captions:[];
  const draft={...defaultNovelAiDraft,model:model??defaultNovelAiDraft.model,effort:medium?'medium':'high',qualityPreset:'none',negativePreset:'none',autoText:false,
    transparent:comment.tag_hint_transparent_background??false,straightAlpha:comment.straight_alpha??true,
    prompt:positive?.base_caption??comment.prompt??raw.Description??'',negative:negative?.base_caption??comment.uc??comment.negative_prompt??'',
    width:comment.width??defaultNovelAiDraft.width,height:comment.height??defaultNovelAiDraft.height,steps:comment.steps??defaultNovelAiDraft.steps,
    guidance:comment.scale??defaultNovelAiDraft.guidance,rescale:comment.cfg_rescale??0,seed:comment.seed??null,sampler:comment.sampler??defaultNovelAiDraft.sampler,noiseSchedule:comment.noise_schedule??defaultNovelAiDraft.noiseSchedule,
    samples:comment.n_samples??1,useCoordinates:comment.v4_prompt?.use_coords??false,characters:chars.map((c:any,i:number)=>({enabled:true,prompt:c.char_caption??'',negative:negative?.char_captions?.[i]?.char_caption??'',x:c.centers?.[0]?.x??0.5,y:c.centers?.[0]?.y??0.5}))};
  const parsed=novelAiDraftInput.safeParse(draft);
  if(!parsed.success)return {raw,notices:[...notices,'图片包含当前基础模式不支持的参数。原始元数据保留，未创建可直接发送的配方。']};
  const extras=Object.keys(comment).filter(k=>/reference|image|mask|strength|noise$/.test(k));
  if(extras.length)notices.push('参考图、图生图或蒙版参数仅保存在原始元数据中，当前草稿不发送这些字段。');
  return {raw,input:parsed.data,notices};
}
