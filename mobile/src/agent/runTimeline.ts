import type { PromptRun } from './runState';
export type { ProcessEntry } from '../conversation/types';
export { projectRunTimeline } from '../conversation/projectTimeline';
export type { ProcessRow } from '../conversation/projectTimeline';

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
