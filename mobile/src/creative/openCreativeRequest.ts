export type OpenCreativeRequest = { requestId: string } & (
  { kind:'draft'; draftId:string } | {kind:'legacy';legacyId:string} |
  {kind:'recent'|'new';mode:'image'|'video'}
);
export function parseOpenCreativeRequest(params:Record<string,string|string[]|undefined>):OpenCreativeRequest|undefined {
  const first=(key:string)=>Array.isArray(params[key])?params[key]![0]:params[key] as string|undefined;
  const legacyId=first('draftId'),draftId=first('creativeDraftId'),mode=first('mode'),requestId=first('requestId');
  if(legacyId)return {kind:'legacy',legacyId,requestId:requestId??`legacy:${legacyId}`};
  if(draftId)return {kind:'draft',draftId,requestId:requestId??`draft:${draftId}`};
  if(mode==='image'||mode==='video')return {kind:first('intent')==='new'?'new':'recent',mode,requestId:requestId??`recent:${mode}`};
}
