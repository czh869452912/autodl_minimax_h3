import { pickImagesFromGallery } from './imagePicker';

describe('image source picker', () => {
  it('maps selected gallery assets', async () => {
    const launch = jest.fn().mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 1234 }] });
    await expect(pickImagesFromGallery(3, launch)).resolves.toEqual([{ uri: 'file:///photo.jpg', name: 'photo.jpg', mimeType: 'image/jpeg', size: 1234 }]);
    expect(launch).toHaveBeenCalledWith(3);
  });
});
