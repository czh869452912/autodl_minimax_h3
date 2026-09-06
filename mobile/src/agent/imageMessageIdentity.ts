import { rebuildImageMentions } from './imageMentions';

export type ImageIdentity = { attachmentId: string; displayName: string };

export function applyImageIdentities<T>(message: T, identities: readonly ImageIdentity[]): T {
  if (!message || typeof message !== 'object' || !identities.length) return message;
  const source = message as Record<string, unknown>;
  if (source.role !== 'user') return message;
  let index = 0;
  const decorate = (part: unknown) => {
    if (!part || typeof part !== 'object') return part;
    const item = part as Record<string, unknown>;
    if (item.type !== 'image' && item.type !== 'image_url') return part;
    const identity = identities[index++];
    if (!identity) return part;
    return { ...item, metadata: {
      ...(item.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
      ...identity,
    } };
  };
  const content = Array.isArray(source.content) ? source.content.map(decorate) : source.content;
  const attachments = Array.isArray(source.attachments) ? source.attachments.map(decorate) : source.attachments;
  const text = typeof content === 'string' ? content : Array.isArray(content)
    ? content.flatMap((part) => part?.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join('\n')
    : '';
  return { ...source, content, ...(attachments ? { attachments } : {}),
    imageMentions: rebuildImageMentions(text, identities.map(({ attachmentId, displayName }) => ({ id: attachmentId, displayName }))),
  } as T;
}
