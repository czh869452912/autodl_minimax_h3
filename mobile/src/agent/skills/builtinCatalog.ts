import CryptoJS from 'crypto-js';
import {load,JSON_SCHEMA} from 'js-yaml';
import {officialH3Skills,officialH3SkillManifest} from '../skillBundle';
export const builtinSkillFingerprint=CryptoJS.SHA256(JSON.stringify(officialH3SkillManifest)).toString();
export function builtinSkillCatalog(){
 return Object.keys(officialH3Skills).filter(path=>/^\/skills\/[^/]+\/SKILL.md$/.test(path)).sort().map(path=>{
  const body=String(officialH3Skills[path].content),root=path.slice(0,-8);
  const meta=load(body.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]??'',{schema:JSON_SCHEMA}) as {name?:string;description?:string}|null;
  const localized=load(String(officialH3Skills[root+'meta.yaml']?.content??'{}'),{schema:JSON_SCHEMA}) as Record<string,unknown>|null;
  const display=(key:string,fallback:string)=>typeof localized?.[key]==='string'?localized[key] as string:fallback;
  return {displayName:display('display-name-zh',meta?.name==='h3-prompt-writing'?'H3 提示词编写':meta?.name??''),summary:display('summary-cn',meta?.name==='h3-prompt-writing'?'帮助组织镜头、主体与运动描述，编写用于视频生成的提示词。':meta?.description??''),localizedDescription:display('desc-cn',meta?.description??''),version:display('version','随应用发布'),path,name:meta?.name??root.split('/').at(-2)!,description:meta?.description??'',fingerprint:builtinSkillFingerprint,files:Object.fromEntries(Object.entries(officialH3Skills).filter(([key])=>key.startsWith(root)).map(([key,file])=>[key.slice(root.length),String(file.content)]))};
 });
}
export const builtinSkillSnapshot=()=>({fingerprint:builtinSkillFingerprint,skills:builtinSkillCatalog().map(({path,name,description})=>({path,name,description}))});
