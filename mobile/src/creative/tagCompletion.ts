export type CompletionToken={start:number;end:number;query:string};
/** Work only on the comma-delimited tag at the caret. Never rewrite weights or quoted text. */
export function completionToken(text:string,selection:{start:number;end:number}):CompletionToken|undefined{
 if(selection.start!==selection.end||selection.start<0||selection.end>text.length)return;
 const caret=selection.start,before=text.slice(0,caret);
 if((before.match(/(?<!\\)"/g)?.length??0)%2)return;
 let start=Math.max(before.lastIndexOf(','),before.lastIndexOf('\n'),before.lastIndexOf('::')>=0?before.lastIndexOf('::')+1:-1)+1;
 while(/\s/.test(text[start]??'')&&start<caret)start++;
 if(text.slice(start,start+7)==='artist:')start+=7;
 let end=caret;while(end<text.length&&!/[,\n]/.test(text[end])&&text.slice(end,end+2)!=='::')end++;
 const query=text.slice(start,caret).trim();
 if(query.length<2||query.length>80||/["{}\[\]|]/.test(query)||/^[+-]?[\d.]+$/.test(query)||query.split(/\s+/).length>5)return;
 return {start,end,query};
}
export function replaceCompletion(text:string,token:CompletionToken,tag:string){
 const inserted=tag.replaceAll('_',' '),suffix=text.slice(token.end);
 // Preserve closing weight delimiters and the surrounding prompt verbatim.
 const tail=suffix? '':', ';
 return {text:text.slice(0,token.start)+inserted+tail+suffix,caret:token.start+inserted.length+tail.length};
}
