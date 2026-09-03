import { mergeUniqueAssistantAttachments, pickAssistantImages } from './assistantImagePicker';

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///document.jpg', name: 'document.jpg', mimeType: 'image/jpeg', size: 3 }],
  }),
}));

describe('pickAssistantImages', () => {
  it('reads gallery images into ready assistant attachments', async () => {
    await expect(pickAssistantImages('gallery', 2, {
      pickGallery: async () => [{ uri: 'file:///photo.jpg', name: 'photo.jpg', mimeType: 'image/jpeg', size: 7 }],
      pickFiles: async () => [],
      read: async () => ({ type: 'data', value: 'encoded', mimeType: 'image/jpeg' }),
      createId: () => 'gallery-1',
    })).resolves.toEqual([
      {
        id: 'gallery-1',
        type: 'image',
        status: 'ready',
        filename: 'photo.jpg',
        size: 7,
        source: { type: 'data', value: 'encoded', mimeType: 'image/jpeg' },
      },
    ]);
  });

  it('uses the document picker for the file source', async () => {
    await expect(pickAssistantImages('file', 1, {
      read: async () => ({ type: 'data', value: 'encoded', mimeType: 'image/jpeg' }),
      createId: () => 'file-1',
    })).resolves.toMatchObject([{ filename: 'document.jpg' }]);
  });

  it('rejects images above the assistant attachment limit before reading them', async () => {
    const read = jest.fn();
    await expect(pickAssistantImages('gallery', 1, {
      pickGallery: async () => [{ uri: 'file:///large.jpg', name: 'large.jpg', mimeType: 'image/jpeg', size: 20 * 1024 * 1024 + 1 }],
      read,
    })).rejects.toThrow('图片附件不能超过 20MB');
    expect(read).not.toHaveBeenCalled();
  });

  it('allocates unique IDs when every candidate ID collides', async () => {
    const attachments = await pickAssistantImages('gallery', 3, {
      pickGallery: async () => [1, 2, 3].map((index) => ({ uri: `file:///${index}.jpg`, name: `${index}.jpg`, mimeType: 'image/jpeg', size: 1 })),
      pickFiles: async () => [],
      read: async (file) => ({ type: 'data', value: file.uri, mimeType: file.mimeType }),
      createId: () => 'same-id',
    });
    expect(attachments.map((item) => item.id)).toEqual(['same-id', 'same-id-2', 'same-id-3']);
  });

  it('repairs incoming IDs without changing existing attachment identity', () => {
    const current = [{ id: 'same-id' }] as never;
    const incoming = [{ id: 'same-id' }, { id: 'fresh' }] as never;
    expect(mergeUniqueAssistantAttachments(current, incoming, new Set(['provider-id']))).toMatchObject([
      { id: 'same-id' }, { id: 'same-id-2' }, { id: 'fresh' },
    ]);
  });
});
