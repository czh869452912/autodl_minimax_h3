import {createMiddleware} from 'langchain';
import {createCreativeAgentTools} from '../creative/agentTools';

export type ToolPolicyEntry={name:string;version:1;effect:'read'|'workspace'|'proposal'|'write'|'consume'|'delegate';output:'structured-receipt'|'text';requires:'scope'|'workspace'|'structured-authorization'};
const reads=new Set(['creative_context','project_search','capability_list','asset_search','asset_versions','asset_read_text','shot_get','shot_quality_check','semantic_list','semantic_get','draft_get','generation_status']);
const filesystem=['ls','read_file','glob','grep','write_file','edit_file','write_todos'];
export function creativeToolPolicy(role:'assistant'|'review'='assistant'){
 const tools=createCreativeAgentTools();
 const entries:ToolPolicyEntry[]=tools.map(tool=>({name:tool.name,version:1,effect:tool.name==='generation_submit'?'consume':['project_update','shot_update'].includes(tool.name)?'proposal':reads.has(tool.name)?'read':'write',output:'structured-receipt',requires:tool.name==='generation_submit'?'structured-authorization':'scope'}));
 entries.push(...filesystem.map(name=>({name,version:1 as const,effect:(['ls','read_file','glob','grep'].includes(name)?'read':'workspace') as ToolPolicyEntry['effect'],output:'text' as const,requires:'workspace' as const})));
 if(role==='assistant')entries.push({name:'review_project',version:1,effect:'delegate',output:'text',requires:'scope'});
 const effective=role==='review'?entries.filter(e=>e.effect==='read'):entries;
 return {version:'android-tool-policy-2',tools:tools.filter(t=>effective.some(e=>e.name===t.name)),entries:effective.sort((a,b)=>a.name.localeCompare(b.name))};
}
export function toolPolicyMiddleware(entries:ToolPolicyEntry[]){
 const allowed=new Set(entries.map(entry=>entry.name));
 return createMiddleware({name:'AndroidToolPolicy',
  wrapModelCall:async(request,handler)=>handler({...request,tools:request.tools.filter(tool=>allowed.has(String(tool.name)))}),
  wrapToolCall:async(request,handler)=>{if(!allowed.has(request.toolCall.name))throw new Error('TOOL_POLICY_DENIED');return handler(request);},
 });
}

