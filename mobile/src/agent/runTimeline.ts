import type { PresentationMessage } from './agentPresentation';
import type { PromptRun, PromptRunTool } from './runState';

import type { ProcessEntry } from '../conversation/types';
export type { ProcessEntry } from '../conversation/types';
export type ProcessRow = { id: string; kind: 'run'; run: PromptRun; entries: ProcessEntry[] };

export function indexRunTools(transcript: readonly unknown[]) {
  const args = new Map<string, string>();
  const outputs = new Map<string, string>();
  for (const raw of transcript) {
    const message = raw as { role?: string; toolCallId?: string; content?: unknown; toolCalls?: Array<{ id: string; function?: { arguments?: string } }> };
    for (const call of message.toolCalls ?? []) if (typeof call.function?.arguments === 'string') args.set(call.id, call.function.arguments);
    if (message.toolCallId && ['tool', 'tool_result'].includes(message.role ?? '')) {
      const content = message.content;
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map(part => typeof part === 'string' ? part : part?.text ?? '').join('\n') : '';
      if (text) outputs.set(message.toolCallId, text);
    }
  }
  return { args, outputs };
}

export function enrichRunTools(runs: PromptRun[], transcript: readonly unknown[], toolIndex = indexRunTools(transcript)): PromptRun[] {
  const { args, outputs } = toolIndex;
  return runs.map(run => {
    const tools = run.tools.map(tool => {
      const argumentsValue = tool.arguments ?? args.get(tool.id), output = tool.output ?? outputs.get(tool.id);
      return argumentsValue === tool.arguments && output === tool.output ? tool : { ...tool, arguments: argumentsValue, output };
    });
    return tools.every((tool, index) => tool === run.tools[index]) ? run : { ...run, tools };
  });
}

/** Keep prose and human steering visible; only adjacent activity is collapsible. */
export function projectRunTimeline(rows: PresentationMessage[], runs: PromptRun[], _completedIds: readonly string[]): Array<PresentationMessage | ProcessRow> {
  const after = new Map<string, ProcessRow[]>();
  const orphaned: ProcessRow[] = [];
  const rowIds = new Set(rows.map(row => row.id));
  for (const run of runs) {
    const messages = rows.filter((row): row is Extract<PresentationMessage,{kind:'assistant'}> => row.kind === 'assistant' && run.messageIds.includes(row.id));
    const buckets = new Map<string, ProcessEntry[]>();
    const fallback = messages[0]?.id ?? run.userMessageId;
    const add = (anchor:string, entry:ProcessEntry) => { const list=buckets.get(anchor)??[]; if(!list.some(e=>e.id===entry.id))list.push(entry); buckets.set(anchor,list); };
    const toolMap = new Map(run.tools.map(tool=>[tool.id,tool]));
    for(const message of messages)for(const tool of message.tools)if(!toolMap.has(tool.id))toolMap.set(tool.id,{...tool,startedAt:0,parentMessageId:message.id});
    for(const activity of run.activities??[]) {
      const anchor=rowIds.has(activity.messageId)?activity.messageId:fallback;
      if(activity.kind==='reasoning' && activity.text?.trim())add(anchor,{id:activity.id,kind:'reasoning',text:activity.text});
      if(activity.kind==='tool') {const tool=toolMap.get(activity.id);if(tool){add(anchor,{id:tool.id,kind:'tool',tool});toolMap.delete(tool.id);}}
    }
    for(const tool of toolMap.values()) {
      const owner=tool.parentMessageId ?? messages.find(m=>m.tools.some(t=>t.id===tool.id))?.id;
      add(owner && rowIds.has(owner)?owner:fallback,{id:tool.id,kind:'tool',tool});
    }
    if(!buckets.size)buckets.set(messages.at(-1)?.id??run.userMessageId,[]);
    const anchors=[...buckets.keys()].sort((a,b)=>rows.findIndex(r=>r.id===a)-rows.findIndex(r=>r.id===b));
    anchors.forEach((anchor,index)=>{
      const terminal=index===anchors.length-1;
      const entries=buckets.get(anchor)!;
      const tools=entries.flatMap(e=>e.kind==='tool'?[e.tool]:[]);
      const segment=terminal?{...run,tools}:{...run,tools,status:'completed' as const,error:undefined,retryOf:undefined,endedAt:tools.at(-1)?.endedAt??run.startedAt};
      const item:ProcessRow={id:index===0?`run-${run.id}`:`run-${run.id}-${anchor}`,kind:'run',run:segment,entries};
      if(rowIds.has(anchor))after.set(anchor,[...(after.get(anchor)??[]),item]);else orphaned.push(item);
    });
  }
  return [...orphaned.sort((a,b)=>a.run.startedAt-b.run.startedAt),...rows.flatMap(row=>[row,...(after.get(row.id)??[])])];
}
