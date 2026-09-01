import { prepareAutodlInput } from './prepareInputs';

test('reads local media sequentially and preserves zero-based order', async () => {
  let concurrent = 0;
  let peak = 0;
  const readBase64 = jest.fn(async (uri: string) => {
    concurrent += 1;
    peak = Math.max(peak, concurrent);
    await Promise.resolve();
    concurrent -= 1;
    return uri.endsWith('1.png') ? 'AQ==' : 'Ag==';
  });
  const result = await prepareAutodlInput({
    prompt: 'p', resolution: '768p竖', duration: 5,
    images: [
      { uri: 'file:///1.png', name: '1.png', mime: 'image/png', size: 1 },
      { uri: 'file:///2.png', name: '2.png', mime: 'image/png', size: 1 },
    ],
  }, { readBase64 });
  expect(peak).toBe(1);
  expect(result.images?.map((item) => item.dataUri)).toEqual([
    'data:image/png;base64,AQ==', 'data:image/png;base64,Ag==',
  ]);
});

test('rejects unsupported MIME, too many references, and aggregate byte overflow before reading', async () => {
  const readBase64 = jest.fn();
  await expect(prepareAutodlInput({ prompt: 'p', resolution: '768p竖', duration: 5, images: [{ uri: 'file:///x.svg', mime: 'image/svg+xml', size: 1 }] }, { readBase64 })).rejects.toThrow('不支持的图片格式');
  await expect(prepareAutodlInput({ prompt: 'p', resolution: '768p竖', duration: 5, images: Array.from({ length: 10 }, (_, i) => ({ uri: `file:///${i}.png`, mime: 'image/png', size: 1 })) }, { readBase64 })).rejects.toThrow('最多 9 张');
  await expect(prepareAutodlInput({ prompt: 'p', resolution: '768p竖', duration: 5, audios: [{ uri: 'file:///x.wav', mime: 'audio/wav', size: 51 * 1024 * 1024 }] }, { readBase64, maxRawBytes: 50 * 1024 * 1024 })).rejects.toThrow('总大小');
  expect(readBase64).not.toHaveBeenCalled();
});
