export type RecipeDifference={path:string;before:string;after:string};
const format=(value:unknown)=>value===undefined?'（未记录）':JSON.stringify(value);
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
/** Bounded display diff; arrays retain their ordering and values remain inert data. */
export function compareRecipeFields(left:unknown,right:unknown,limit=80){
  const rows:RecipeDifference[]=[];let truncated=false;
  const visit=(a:unknown,b:unknown,path:string,depth:number)=>{
    if(truncated||a===b)return;
    if(record(a)&&record(b)&&depth<8){
      for(const key of [...new Set([...Object.keys(a),...Object.keys(b)])].sort()){
        visit(Object.hasOwn(a,key)?a[key]:undefined,Object.hasOwn(b,key)?b[key]:undefined,path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'),depth+1);
        if(truncated)break;
      }
      return;
    }
    if(JSON.stringify(a)===JSON.stringify(b))return;
    if(rows.length>=limit){truncated=true;return;}
    rows.push({path:path||'/',before:format(a).slice(0,2000),after:format(b).slice(0,2000)});
  };
  visit(left,right,'',0);return {rows,truncated};
}
