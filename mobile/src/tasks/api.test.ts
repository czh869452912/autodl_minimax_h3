import { buildTaskPayload, getTask } from './api';

test('buildTaskPayload preserves generation options and reference data URIs', () => {
  expect(buildTaskPayload({
    prompt: 'camera move', duration: 8, resolution: '1080p横', seed: '42',
    images: [{ dataUri: 'data:image/png;base64,abc' }],
    audios: [{ dataUri: 'data:audio/mpeg;base64,xyz' }],
  })).toEqual({
    prompt: 'camera move', duration: 8, resolution: '1080p横', seed: 42,
    ref_image_1: 'data:image/png;base64,abc', ref_audio_1: 'data:audio/mpeg;base64,xyz',
  });
});

test('getTask accepts provider URLs without an mp4 suffix', async () => {
  globalThis.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'success', data: { status: 'SUCCESSFUL', results: [{ type: 'video', url: 'https://cdn.example.test/download?id=1' }] } }), { status: 200 })) as unknown as typeof fetch;
  const task = await getTask('token', { id: '1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5, createdAt: 1, updatedAt: 1 });
  expect(task.videoUrl).toBe('https://cdn.example.test/download?id=1');
});
