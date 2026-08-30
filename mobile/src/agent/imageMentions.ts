export type ImageMention = {
  attachmentId: string;
  label: string;
  start: number;
  end: number;
};

export type MentionAttachment = {
  id: string;
  filename?: string;
};

type TextSelection = { start: number; end: number };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function getImageMentionDisplayName(filename?: string): string {
  const trimmed = filename?.trim() ?? '';
  const withoutExtension = trimmed.replace(/\.[^.]+$/, '').trim();
  return withoutExtension || '图片';
}

function mentionLabel(filename?: string): string {
  return `@${getImageMentionDisplayName(filename)}`;
}

export function insertImageMention(
  text: string,
  selection: TextSelection,
  attachment: MentionAttachment,
  mentions: ImageMention[],
): {
  text: string;
  mention: ImageMention;
  mentions: ImageMention[];
  selection: TextSelection;
} {
  const start = clamp(Math.min(selection.start, selection.end), 0, text.length);
  const end = clamp(Math.max(selection.start, selection.end), start, text.length);
  const label = mentionLabel(attachment.filename);
  const insertedText = `${label} `;
  const delta = insertedText.length - (end - start);
  const nextText = `${text.slice(0, start)}${insertedText}${text.slice(end)}`;
  const mention: ImageMention = {
    attachmentId: attachment.id,
    label,
    start,
    end: start + label.length,
  };
  const shifted = mentions.flatMap((current) => {
    if (current.end <= start) return [current];
    if (current.start >= end) {
      return [{ ...current, start: current.start + delta, end: current.end + delta }];
    }
    return [];
  });
  const nextSelection = start + insertedText.length;
  return {
    text: nextText,
    mention,
    mentions: [...shifted, mention].sort((left, right) => left.start - right.start),
    selection: { start: nextSelection, end: nextSelection },
  };
}

export function reconcileImageMentions(
  text: string,
  mentions: ImageMention[],
  attachmentIds: Set<string>,
): ImageMention[] {
  return mentions.filter(
    (mention) =>
      attachmentIds.has(mention.attachmentId) &&
      Number.isInteger(mention.start) &&
      Number.isInteger(mention.end) &&
      mention.start >= 0 &&
      mention.end >= mention.start &&
      mention.end <= text.length &&
      text.slice(mention.start, mention.end) === mention.label,
  );
}
