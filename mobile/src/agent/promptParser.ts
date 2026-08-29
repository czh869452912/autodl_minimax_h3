export type PromptParseResult = {
  promptText: string;
  sourceMessageId: string;
  confidence: 'high' | 'medium';
};

const TITLE =
  /(?:^|\n)\s{0,3}(?:#{1,6}\s*)?(?:H3\s+Prompt|最终\s*Prompt)\s*:?\s*\n([\s\S]*?)(?=\n\s*#{1,6}\s|$)/i;
const FENCE = /```(?:text|prompt|markdown)?\s*\n([\s\S]*?)```/i;
const FIELD = /(?:^|\n)\s*(?:prompt|Prompt)\s*:\s*(.+(?:\n(?!\s*\w+\s*:).+)*)/;

export function parsePromptResult(
  content: string,
  messageId: string,
): PromptParseResult | null {
  const titled = content.match(TITLE)?.[1]?.trim();
  if (titled)
    return {
      promptText: titled,
      sourceMessageId: messageId,
      confidence: 'high',
    };
  const fenced = content.match(FENCE)?.[1]?.trim();
  if (fenced)
    return {
      promptText: fenced,
      sourceMessageId: messageId,
      confidence: 'high',
    };
  const field = content.match(FIELD)?.[1]?.trim();
  if (field)
    return {
      promptText: field,
      sourceMessageId: messageId,
      confidence: 'medium',
    };
  return null;
}
