import {z} from 'zod';
import type {WorkflowDefinition} from '../workflows/schema/types';
import type {RegistryRecord} from '../workflows/registry/types';
import {alignWorkflowInputs,canonicalInputs,inputField,inputProperties} from '../workflows/inputModel';
import {formatSubmissionFieldError} from '../create/submissionValidation';

export const workflowVideoInput=z.object({
  schemaVersion:z.literal(2),sessionId:z.string().min(1).max(200),
  workflow:z.object({id:z.string().min(1).max(200),version:z.string().min(1).max(100),contentHash:z.string().min(1).max(200),title:z.string().max(200).optional()}).strict(),
  prompt:z.string().max(10000).default(''),values:z.record(z.string(),z.unknown()).refine(value=>JSON.stringify(value).length<=100000,'视频参数过长'),
}).strict();
export type WorkflowVideoInput=z.infer<typeof workflowVideoInput>;
export function videoSession(input:Record<string,any>,fallback:string){return input.schemaVersion===2?String(input.sessionId):fallback;}
export function videoPrompt(input:Record<string,any>){return String(input.prompt??input.values?.prompt??'');}
export function videoWorkflowReason(definition:WorkflowDefinition){
  if(definition.kind!=='atomic' || definition.platform.adapter!=='autodl-comfyui' || definition.platform.operation!=='workflow.submit')return '此执行适配器尚未接入手工视频';
  if(!definition.outputs.artifacts.some(a=>a.kind==='video'))return '此工作流不输出视频';
  for(const [field,schema] of Object.entries(inputProperties(definition))){
    if(field===inputField(definition,'images') || field===inputField(definition,'audios')){if(schema.type!=='array')return `暂未接入素材结构：${schema.title??field}`;continue;}
    if(!['string','integer','number','boolean'].includes(String(schema.type)))return `暂未接入输入：${schema.title??field}`;
    if(['image','image[]','audio','audio[]','video'].includes(String(schema['x-workflow.semantic'])))return `暂未接入素材角色：${schema.title??field}`;
    if(schema['x-workflow.semantic']&&!['prompt','negativePrompt','text','number','integer','boolean','enum','seed'].includes(String(schema['x-workflow.semantic'])))return `暂未接入字段：${schema.title??field}`;
  }
  return '';
}
export function workflowVideoState(record:RegistryRecord,definition:WorkflowDefinition,sessionId:string,values:Record<string,unknown>):WorkflowVideoInput{
  return {schemaVersion:2,sessionId,workflow:{id:record.workflowId,version:record.version,contentHash:record.contentHash,title:definition.metadata.title},prompt:String(values[inputField(definition,'prompt')]??''),values};
}
export function alignVideoState(record:RegistryRecord,definition:WorkflowDefinition,sessionId:string,source:Record<string,unknown>={}){
  const {schemaVersion:_,...legacy}=source;
  const aligned=alignWorkflowInputs(definition,legacy);
  const values={...aligned.values};delete values[inputField(definition,'images')];delete values[inputField(definition,'audios')];
  const errors=aligned.errors.filter(error=>values[error.path.slice(1)]!==''&&values[error.path.slice(1)]!==undefined).map(error=>formatSubmissionFieldError({...error,field:error.path.slice(1),value:values[error.path.slice(1)]},definition));
  return {input:workflowVideoState(record,definition,sessionId,values),notices:[...aligned.notices,...errors]};
}
export function transferVideoValues(previous:WorkflowDefinition,values:Record<string,unknown>){
  const result=canonicalInputs(previous,values);delete result.seed;delete result.images;delete result.audios;
  return result;
}
