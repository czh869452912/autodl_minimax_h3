import { normalizeMessages, type PresentationMessage } from './agentPresentation';
import { recordFields, sameRecordFields } from './agentRecords';
export function createTimelineProjection(normalize = normalizeMessages) {
  const cache = new Map<string, { fields: unknown[]; row: PresentationMessage | undefined }>();
  return (messages: readonly unknown[]): PresentationMessage[] => {
    const present = new Set<string>();
    const rows: PresentationMessage[] = [];
    for (const raw of messages) {
      const message = raw as any;
      if (typeof message.id !== 'string' || !['user', 'assistant'].includes(message.role)) continue;
      present.add(message.id);
      const next = recordFields(message), previous = cache.get(message.id);
      if (!previous || !sameRecordFields(previous.fields, next)) {
        cache.set(message.id, { fields: next, row: normalize([message])[0] });
      }
      const row = cache.get(message.id)?.row;
      if (row) rows.push(row);
    }
    for (const id of cache.keys()) if (!present.has(id)) cache.delete(id);
    return rows;
  };
}
