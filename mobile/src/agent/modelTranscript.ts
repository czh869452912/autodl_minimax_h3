const rec = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
const resultId = (message: Record<string, any>): string | undefined => {
  const id = message.tool_call_id ?? message.toolCallId;
  return id && (message.role === 'tool' || message.tool === 'tool' || !message.role) ? String(id) : undefined;
};
const textOf = (content: unknown): string => typeof content === 'string' ? content : Array.isArray(content)
  ? content.map(part => typeof part === 'string' ? part : String(rec(part).text ?? '')).join('') : '';

/** Repair the model transcript without mutating the saved, user-visible history. */
export function normalizeModelTranscript(messages: readonly unknown[]): unknown[] {
  const records = messages.map(rec);
  const accepted = new Set<string>();
  const malformed = new Set<string>();
  const emittedResults = new Set<string>();
  const output: unknown[] = [];
  let diagnostics: string[] = [];
  const flushDiagnostics = () => {
    if (diagnostics.length) output.push({ role: 'assistant', content: diagnostics.join('\n').slice(0, 1024) });
    diagnostics = [];
  };
  for (const [index, message] of records.entries()) {
    const id = resultId(message);
    if (id) {
      if (malformed.has(id) && !emittedResults.has(id)) {
        diagnostics.push(`Saved tool call ${id.slice(0, 120)} has malformed arguments; its recorded result is unverified and omitted.`);
      } else if (accepted.has(id) && !emittedResults.has(id)) {
        output.push({ role: 'tool', content: textOf(message.content), tool_call_id: id });
      }
      emittedResults.add(id);
      continue;
    }
    flushDiagnostics();
    const role = String(message.role ?? '').toLowerCase();
    if (!['user', 'human', 'assistant', 'ai', 'system', 'developer'].includes(role)) continue;
    const calls = message.toolCalls ?? message.tool_calls ?? message.additional_kwargs?.tool_calls;
    if ((role === 'assistant' || role === 'ai') && Array.isArray(calls)) {
      const pairedResultIds = new Set<string>();
      for (let position = index + 1; position < records.length; position++) {
        const pairedId = resultId(records[position]);
        if (!pairedId) break;
        pairedResultIds.add(pairedId);
      }
      const toolCalls = calls.flatMap((value: unknown) => {
        const call = rec(value);
        const callId = String(call.id ?? '');
        if (!callId || accepted.has(callId) || malformed.has(callId) || !pairedResultIds.has(callId)) return [];
        const name = call.name ?? call.function?.name;
        let args = call.args ?? call.function?.arguments ?? {};
        try {
          if (typeof args === 'string') args = JSON.parse(args);
          if (!args || typeof args !== 'object' || Array.isArray(args) || typeof name !== 'string' || !name) throw new Error('Invalid saved tool call');
        } catch { malformed.add(callId); return []; }
        accepted.add(callId);
        return [{ id: callId, name, args, type: 'tool_call' }];
      });
      const { toolCalls: _uiCalls, tool_calls: _modelCalls, additional_kwargs: additional, ...rest } = message;
      const { tool_calls: _rawCalls, ...otherAdditional } = rec(additional);
      output.push({ ...rest, ...(additional ? { additional_kwargs: otherAdditional } : {}), role: 'assistant', content: message.content ?? '', tool_calls: toolCalls });
    } else output.push(message);
  }
  flushDiagnostics();
  return output;
}
