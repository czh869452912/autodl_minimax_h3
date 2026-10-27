type RecordValue = Record<string, any>;
const rec = (value: unknown): RecordValue => value && typeof value === 'object' ? value as RecordValue : {};
export function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map(part => typeof part === 'string' ? part : ['thinking', 'reasoning'].includes(rec(part).type) ? '' : String(rec(part).text ?? '')).join('') : '';
}

export function reasoningOf(message: RecordValue): string {
  const extra = message.additional_kwargs;
  if (typeof extra?.reasoning_content === 'string') return extra.reasoning_content;
  if (typeof extra?.reasoning === 'string') return extra.reasoning;
  return Array.isArray(message.content) ? message.content.map((part: unknown) => {
    const block = rec(part);
    return ['thinking', 'reasoning'].includes(block.type) ? String(block.thinking ?? block.reasoning ?? block.text ?? '') : '';
  }).join('') : '';
}

