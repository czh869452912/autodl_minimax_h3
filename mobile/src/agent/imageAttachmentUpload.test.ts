import { readImageAsDataSource } from './imageAttachmentUpload';

it('uses the current Expo File API to read a picked image as base64', async () => {
  const base64 = jest.fn().mockResolvedValue('encoded-image');

  await expect(readImageAsDataSource(
    { uri: 'file:///cache/reference.png', mimeType: 'image/png' },
    () => ({ base64 }),
  )).resolves.toEqual({ type: 'data', value: 'encoded-image', mimeType: 'image/png' });
  expect(base64).toHaveBeenCalledTimes(1);
});
