import type { PresentationMessage } from './agentPresentation';
import type { PromptRun, PromptRunTool } from './runState';

export type ProcessEntry = { id: string; kind: 'text' | 'reasoning'; text: string } | { id: string; kind: 'tool'; tool: PromptRunTool };
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

export function enrichRunTools(runs: PromptRun[], transcript: readonly unknown[], index = indexRunTools(transcript)): PromptRun[] {
  const { args, outputs } = index;
  return runs.map(run => {
    const tools = run.tools.map(tool => {
      const argumentsValue = tool.arguments ?? args.get(tool.id), output = tool.output ?? outputs.get(tool.id);
      return argumentsValue === tool.arguments && output === tool.output ? tool : { ...tool, arguments: argumentsValue, output };
    });
    return tools.every((tool, index) => tool === run.tools[index]) ? run : { ...run, tools };
  });
}

export function projectRunTimeline(rows: PresentationMessage[], runs: PromptRun[], completedIds: readonly string[]): Array<PresentationMessage | ProcessRow> {
  const completed = new Set(completedIds);
  const owners = new Map<string, string>();
  for (const run of runs) for (const id of run.messageIds) owners.set(id, run.id);
  const consumed = new Set<string>();
  const before = new Map<string, ProcessRow[]>();
  const after = new Map<string, ProcessRow[]>();
  const unanchored: ProcessRow[] = [];
  const rowIds = new Set(rows.map(row => row.id));
  const messagesByRun = new Map<string, Array<Extract<PresentationMessage, { kind: 'assistant' }>>>();
  for (const row of rows) {
    const owner = owners.get(row.id);
    if (row.kind !== 'assistant' || !owner) continue;
    const group = messagesByRun.get(owner) ?? [];
    group.push(row); messagesByRun.set(owner, group);
  }
  for (const run of runs) {
    const messages = messagesByRun.get(run.id) ?? [];
    const entries: ProcessEntry[] = [];
    const byId = new Map<string, ProcessEntry>();
    for (const message of messages) {
      const final = completed.has(message.id);
      const text = final ? '' : message.text;
      if (text.trim()) byId.set(`text:${message.id}`, { id: `text:${message.id}`, kind: 'text', text });
      if (!final) consumed.add(message.id);
    }
    for (const tool of run.tools) byId.set(tool.id, { id: tool.id, kind: 'tool', tool });
    for (const message of messages) for (const tool of message.tools) {
      if (!byId.has(tool.id)) byId.set(tool.id, { id: tool.id, kind: 'tool', tool: { ...tool, startedAt: run.startedAt, endedAt: run.endedAt } });
    }
    for (const activity of run.activities ?? []) {
      if (activity.kind === 'reasoning' && activity.text?.trim()) entries.push({ id: activity.id, kind: 'reasoning', text: activity.text });
      else {
        const entry = byId.get(activity.id);
        if (entry) { entries.push(entry); byId.delete(activity.id); }
      }
    }
    // Older runs have no activity ledger. Recover order from their transcript.
    for (const message of messages) {
      for (const id of [`text:${message.id}`, ...message.tools.map(tool => tool.id)]) {
        const entry = byId.get(id);
        if (entry) { entries.push(entry); byId.delete(id); }
      }
    }
    entries.push(...byId.values());
    const process: ProcessRow = { id: `run-${run.id}`, kind: 'run', run, entries };
    const anchor = messages[0]?.id;
    if (anchor) before.set(anchor, [...(before.get(anchor) ?? []), process]);
    else if (rowIds.has(run.userMessageId)) after.set(run.userMessageId, [...(after.get(run.userMessageId) ?? []), process]);
    else unanchored.push(process);
  }
  return [...unanchored.sort((a, b) => a.run.startedAt - b.run.startedAt), ...rows.flatMap(row => [...(before.get(row.id) ?? []), ...(consumed.has(row.id) ? [] : [row]), ...(after.get(row.id) ?? [])])];
}
