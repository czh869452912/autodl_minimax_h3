import CryptoJS from 'crypto-js';
import {load,JSON_SCHEMA} from 'js-yaml';
import {officialH3Skills,officialH3SkillManifest} from '../skillBundle';
export const builtinSkillFingerprint=CryptoJS.SHA256(JSON.stringify(officialH3SkillManifest)).toString();
export function builtinSkillCatalog(){
 return Object.keys(officialH3Skills).filter(path=>/^\/skills\/[^/]+\/SKILL.md$/.test(path)).sort().map(path=>{
  const body=String(officialH3Skills[path].content),root=path.slice(0,-8);
  const meta=load(body.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]??'',{schema:JSON_SCHEMA}) as {name?:string;description?:string}|null;
  return {path,name:meta?.name??root.split('/').at(-2)!,description:meta?.description??'',fingerprint:builtinSkillFingerprint,files:Object.fromEntries(Object.entries(officialH3Skills).filter(([key])=>key.startsWith(root)).map(([key,file])=>[key.slice(root.length),String(file.content)]))};
 });
}
export const builtinSkillSnapshot=()=>({fingerprint:builtinSkillFingerprint,skills:builtinSkillCatalog().map(({path,name,description})=>({path,name,description}))});
