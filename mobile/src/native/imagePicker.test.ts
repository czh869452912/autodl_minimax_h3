import { pickImagesFromGallery } from './imagePicker';

describe('image source picker', () => {
  it('maps selected gallery assets', async () => {
    const launch = jest.fn().mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 1234 }] });
    await expect(pickImagesFromGallery(3, launch)).resolves.toEqual([{ uri: 'file:///photo.jpg', name: 'photo.jpg', mimeType: 'image/jpeg', size: 1234 }]);
    expect(launch).toHaveBeenCalledWith(3);
  });

  it('allocates distinct fallback names for a same-millisecond batch', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(100);
    jest.spyOn(Math, 'random').mockReturnValue(0.25);
    const launch = jest.fn().mockResolvedValue({ canceled: false, assets: [1, 2, 3].map((index) => ({ uri: `file:///${index}.jpg` })) });
    const files = await pickImagesFromGallery(3, launch);
    expect(new Set(files.map((file) => file.name)).size).toBe(3);
    expect(files.every((file) => file.name.endsWith('.jpg'))).toBe(true);
  });
});
