export type PromptChunk={name:string;text:string};
export function expandPromptChunks(text:string,chunks:PromptChunk[],stack:string[]=[]):string{
 const result=text.replace(/!macro:([^!]+)!/g,(_token,name:string)=>{
  if(stack.includes(name))throw new Error(`片段循环引用：${[...stack,name].join(' → ')}`);
  if(stack.length>=16)throw new Error('片段嵌套超过16层');
  const matches=chunks.filter(c=>c.name===name);
  if(matches.length!==1)throw new Error(matches.length?`片段名称重复：${name}`:`找不到片段：${name}`);
  return expandPromptChunks(matches[0].text,chunks,[...stack,name]);
 });
 if(result.length>10000)throw new Error('展开后的提示词超过10000字符');
 return result;
}
export function mergePromptChunks(saved:PromptChunk[],draft:PromptChunk[]){
 return [...saved.filter(c=>!draft.some(d=>d.name===c.name)),...draft];
}
