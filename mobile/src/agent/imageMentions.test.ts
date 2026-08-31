import {
  insertImageMention,
  assignImageDisplayNames,
  rebuildImageMentions,
  removeImageMentionOnBackspace,
  reconcileImageMentions,
  type ImageMention,
} from './imageMentions';

describe('image mention text helpers', () => {
  const attachment = { id: 'image-1', filename: '角色正面.png' };

  it('inserts a display token at the captured cursor and returns the next cursor', () => {
    expect(insertImageMention('雨中的', { start: 3, end: 3 }, attachment, [])).toEqual({
      text: '雨中的@角色正面 ',
      mention: { attachmentId: 'image-1', label: '@角色正面', start: 3, end: 8 },
      mentions: [{ attachmentId: 'image-1', label: '@角色正面', start: 3, end: 8 }],
      selection: { start: 9, end: 9 },
    });
  });

  it('replaces a selected range and falls back to 图片 when the filename is missing', () => {
    expect(insertImageMention('画面草稿', { start: 1, end: 2 }, { id: 'image-2' }, [])).toMatchObject({
      text: '画@图片 草稿',
      mention: { attachmentId: 'image-2', label: '@图片', start: 1, end: 4 },
      selection: { start: 5, end: 5 },
    });
  });

  it('shifts later ranges while preserving earlier ranges and repeated references', () => {
    const earlier: ImageMention = { attachmentId: 'old', label: '@旧', start: 0, end: 2 };
    const later: ImageMention = { attachmentId: 'later', label: '@后', start: 5, end: 7 };
    const first = insertImageMention('@旧 abc @后', { start: 3, end: 3 }, attachment, [earlier, later]);
    const second = insertImageMention(first.text, first.selection, attachment, first.mentions);
    expect(first.mentions).toEqual([
      earlier,
      first.mention,
      { ...later, start: 11, end: 13 },
    ]);
    expect(second.mentions.filter((mention) => mention.attachmentId === 'image-1')).toHaveLength(2);
  });

  it('drops missing attachments and ranges whose text no longer matches', () => {
    const mentions: ImageMention[] = [
      { attachmentId: 'image-1', label: '@角色正面', start: 0, end: 5 },
      { attachmentId: 'gone', label: '@旧', start: 6, end: 8 },
    ];
    expect(reconcileImageMentions('@角色正面 已编辑', mentions, new Set(['image-1']))).toEqual([
      mentions[0],
    ]);
    expect(reconcileImageMentions('@破损 已编辑', mentions, new Set(['image-1']))).toEqual([]);
  });

  it('deletes the whole mention when backspace edits inside its token', () => {
    const mention: ImageMention = { attachmentId: 'image-1', label: '@图片1', start: 1, end: 5 };
    expect(removeImageMentionOnBackspace('前@图片1 后', '前@图片 后', { start: 4, end: 4 }, [mention])).toEqual({
      text: '前 后',
      mentions: [],
      selection: { start: 1, end: 1 },
    });
  });

  it('rebuilds mention ranges after plain text before a token changes', () => {
    expect(
      rebuildImageMentions('ab@图片1 后', [
        { id: 'image-1', filename: '100000003.png', displayName: '图片1' },
      ]),
    ).toEqual([
      { attachmentId: 'image-1', label: '@图片1', start: 2, end: 6 },
    ]);
  });

  it('prefers the longest stable token when image numbers share a prefix', () => {
    expect(
      rebuildImageMentions('@图片10', [
        { id: 'image-1', displayName: '图片1' },
        { id: 'image-10', displayName: '图片10' },
      ]),
    ).toEqual([
      { attachmentId: 'image-10', label: '@图片10', start: 0, end: 5 },
    ]);
  });

  it('uses explicit stable display names instead of source filenames', () => {
    expect(insertImageMention('请看 ', { start: 3, end: 3 }, { id: 'image-1', filename: '100000003.png', displayName: '图片1' }, [])).toMatchObject({
      text: '请看 @图片1 ',
      mention: { label: '@图片1' },
    });
  });

  it('assigns names in attachment order and keeps later names after removal', () => {
    const names = new Map<string, string>();
    const first = assignImageDisplayNames(
      [{ id: 'a', filename: '100000003.png' }, { id: 'b', filename: '100000004.png' }],
      names,
      1,
    );
    expect(first.attachments.map((item) => item.displayName)).toEqual(['图片1', '图片2']);
    const second = assignImageDisplayNames([{ id: 'b', filename: '100000004.png' }], names, first.nextNumber);
    expect(second.attachments[0].displayName).toBe('图片2');
  });
});
