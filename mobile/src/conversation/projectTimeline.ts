import type { PromptRun, PromptRunTool, ProcessEntry } from './types';
export type TimelineMessage = { id: string; kind: 'user' | 'assistant'; text: string; tools?: Array<Pick<PromptRunTool, 'id' | 'name' | 'status' | 'summary'>> };
export type ProcessRow = { id: string; kind: 'run'; run: PromptRun; entries: ProcessEntry[]; terminal: boolean; live: boolean };

/** Replies are boundaries, not process details. Preserve the ledger's order around each reply. */
export function projectRunTimeline<T extends TimelineMessage>(rows: T[], runs: PromptRun[], _completedIds: readonly string[] = []): Array<T | ProcessRow> {
  const before = new Map<string, ProcessRow[]>(), after = new Map<string, ProcessRow[]>();
  const orphaned: ProcessRow[] = [];
  const rowIds = new Set(rows.map(row => row.id));
  for (const run of runs) {
    const messages = rows.filter(row => row.kind === 'assistant' && run.messageIds.includes(row.id));
    const fallback = messages[0]?.id ?? run.userMessageId;
    const buckets: Array<{ anchor: string; before: boolean; entries: ProcessEntry[] }> = [];
    const add = (anchor: string, preceding: boolean, entry: ProcessEntry) => {
      let bucket = buckets.find(b => b.anchor === anchor && b.before === preceding);
      if (!bucket) { bucket = { anchor, before: preceding, entries: [] }; buckets.push(bucket); }
      if (!bucket.entries.some(e => e.id === entry.id)) bucket.entries.push(entry);
    };
    const toolMap = new Map(run.tools.map(tool => [tool.id, tool]));
    for (const message of messages) for (const tool of message.tools ?? []) {
      if (!toolMap.has(tool.id)) toolMap.set(tool.id, { ...tool, startedAt: 0, parentMessageId: message.id });
    }
    const spoken = new Set<string>();
    for (const activity of run.activities ?? []) {
      const anchor = activity.messageId || fallback;
      if (activity.kind === 'text') spoken.add(anchor);
      if (activity.kind === 'reasoning' && activity.text?.trim()) add(anchor, !spoken.has(anchor), { id: activity.id, kind: 'reasoning', text: activity.text });
      if (activity.kind === 'tool') {
        const tool = toolMap.get(activity.id);
        if (tool) { add(anchor, !spoken.has(anchor), { id: tool.id, kind: 'tool', tool }); toolMap.delete(tool.id); }
      }
    }
    // Old records lack ordered events: retain their known message ownership without inventing reasoning.
    for (const tool of toolMap.values()) {
      const owner = tool.parentMessageId ?? messages.find(m => m.tools?.some(t => t.id === tool.id))?.id;
      add(owner ?? fallback, false, { id: tool.id, kind: 'tool', tool });
    }
    if (!buckets.length) buckets.push({ anchor: messages.at(-1)?.id ?? run.userMessageId, before: false, entries: [] });
    // A reasoning/tool event can precede creation of its assistant message. Anchor
    // that pending round after its preceding reply, never back at the initial input.
    const placement = (bucket: typeof buckets[number]) => {
      if (rowIds.has(bucket.anchor)) return { anchor: bucket.anchor, before: bucket.before };
      const activityIndex = (run.activities ?? []).findIndex(a => a.messageId === bucket.anchor);
      const preceding = activityIndex >= 0
        ? (run.activities ?? []).slice(0,activityIndex).map(a=>a.messageId)
        : run.messageIds.slice(0,run.messageIds.indexOf(bucket.anchor) < 0 ? undefined : run.messageIds.indexOf(bucket.anchor));
      const anchor = preceding.reverse().find(id=>rowIds.has(id)) ?? run.userMessageId;
      return { anchor, before: false };
    };
    buckets.sort((a,b) => {
      const left=placement(a),right=placement(b);
      return rows.findIndex(r=>r.id===left.anchor)-rows.findIndex(r=>r.id===right.anchor) || Number(right.before)-Number(left.before);
    });
    buckets.forEach((bucket,index) => {
      const terminal = index === buckets.length - 1;
      const tools = bucket.entries.flatMap(e => e.kind === 'tool' ? [e.tool] : []);
      const pending = tools.some(t => t.status === 'running');
      const status = terminal ? run.status : pending ? 'running' : tools.some(t => t.status === 'failed') ? 'failed' : tools.some(t => t.status === 'cancelled') ? 'cancelled' : 'completed';
      const startedAt = tools.length && tools.every(t => t.startedAt > 0) ? Math.min(...tools.map(t => t.startedAt)) : 0;
      const endedAt = tools.length && tools.every(t => t.endedAt !== undefined) ? Math.max(...tools.map(t => t.endedAt!)) : undefined;
      const segment: PromptRun = { ...run, tools, status, startedAt: buckets.length === 1 ? run.startedAt : startedAt,
        endedAt: buckets.length === 1 ? run.endedAt : endedAt, error: terminal ? run.error : undefined, retryOf: terminal ? run.retryOf : undefined };
      const item: ProcessRow = { id: `run-${run.id}-${bucket.anchor}-${bucket.before ? 'before' : 'after'}`, kind: 'run', run: segment, entries: bucket.entries, terminal, live: run.status === 'running' };
      const location=placement(bucket);
      if (rowIds.has(location.anchor)) {
        const target = location.before ? before : after;
        target.set(location.anchor, [...(target.get(location.anchor) ?? []), item]);
      } else orphaned.push(item);
    });
  }
  return [...orphaned.sort((a,b) => a.run.startedAt-b.run.startedAt), ...rows.flatMap(row => [...(before.get(row.id) ?? []), row, ...(after.get(row.id) ?? [])])];
}
