export type ImageMention = {
  attachmentId: string;
  label: string;
  start: number;
  end: number;
};

export type MentionAttachment = {
  id: string;
  filename?: string;
  displayName?: string;
};

type TextSelection = { start: number; end: number };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function getImageMentionDisplayName(filename?: string, displayName?: string): string {
  if (displayName?.trim()) return displayName.trim();
  const trimmed = filename?.trim() ?? '';
  const withoutExtension = trimmed.replace(/\.[^.]+$/, '').trim();
  return withoutExtension || '图片';
}

export function assignImageDisplayNames<T extends MentionAttachment>(
  attachments: T[],
  names: Map<string, string>,
  nextNumber: number,
): { attachments: Array<T & { displayName: string }>; nextNumber: number } {
  let next = nextNumber;
  const named = attachments.map((attachment) => {
    const displayName = names.get(attachment.id) ?? `图片${next++}`;
    names.set(attachment.id, displayName);
    return { ...attachment, displayName };
  });
  return { attachments: named, nextNumber: next };
}

function mentionLabel(filename?: string, displayName?: string): string {
  return `@${getImageMentionDisplayName(filename, displayName)}`;
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
  const label = mentionLabel(attachment.filename, attachment.displayName);
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

/**
 * Treat a deletion that touches an image mention as an atomic token removal.
 * TextInput reports the post-edit value, so the removed range is inferred from
 * the single contiguous deletion between the previous and next values.
 */
export function removeImageMentionOnBackspace(
  previousText: string,
  nextText: string,
  selection: TextSelection,
  mentions: ImageMention[],
): { text: string; mentions: ImageMention[]; selection: TextSelection } | null {
  if (nextText.length >= previousText.length) return null;
  let start = 0;
  while (start < nextText.length && previousText[start] === nextText[start]) start += 1;
  let previousEnd = previousText.length;
  let nextEnd = nextText.length;
  while (previousEnd > start && nextEnd > start && previousText[previousEnd - 1] === nextText[nextEnd - 1]) {
    previousEnd -= 1;
    nextEnd -= 1;
  }
  if (previousEnd <= start) return null;
  const touched = mentions.find(
    (mention) => start < mention.end && previousEnd > mention.start,
  );
  if (!touched) return null;
  const removedLength = touched.end - touched.start;
  const text = `${previousText.slice(0, touched.start)}${previousText.slice(touched.end)}`;
  const nextMentions = mentions
    .filter(
      (mention) =>
        mention !== touched &&
        (mention.end <= touched.start || mention.start >= touched.end),
    )
    .map((mention) =>
      mention.start >= touched.end
        ? { ...mention, start: mention.start - removedLength, end: mention.end - removedLength }
        : mention,
    )
    .sort((left, right) => left.start - right.start);
  return { text, mentions: nextMentions, selection: { start: touched.start, end: touched.start } };
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
