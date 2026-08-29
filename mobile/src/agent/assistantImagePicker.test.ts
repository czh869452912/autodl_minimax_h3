import { pickAssistantImages } from './assistantImagePicker';

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
});
