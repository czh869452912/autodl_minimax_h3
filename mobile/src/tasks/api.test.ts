import { buildTaskPayload, getTask, submitTask } from './api';

const providerFetch = jest.fn();
beforeAll(() => { globalThis.fetch = providerFetch as unknown as typeof fetch; });

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
  providerFetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ code: 'success', data: { status: 'SUCCESSFUL', results: [{ type: 'video', url: 'https://cdn.example.test/download?id=1' }] } }), { status: 200 }));
  const task = await getTask('token', { id: '1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5, createdAt: 1, updatedAt: 1 });
  expect(task.videoUrl).toBe('https://cdn.example.test/download?id=1');
});

test('getTask preserves RUNNING and maps provider timing fields', async () => {
  providerFetch.mockReset().mockResolvedValue(new Response(JSON.stringify({
    code: 'Success',
    data: {
      task_id: '1',
      status: 'RUNNING',
      created_at: '2026-08-14 10:35:28',
      started_at: '2026-08-14 10:35:30',
      duration: 196,
      results: [],
    },
  }), { status: 200 }));

  const task = await getTask('token', {
    id: '1', prompt: 'x', status: 'QUEUED', resolution: '768p竖', duration: 5,
    createdAt: 1, updatedAt: 1,
  });

  expect(task).toMatchObject({
    status: 'RUNNING',
    createdAt: Date.parse('2026-08-14T10:35:28+08:00'),
    startedAt: Date.parse('2026-08-14T10:35:30+08:00'),
    executionDuration: 196,
  });
});

test('submitTask uses provider creation time when returned', async () => {
  providerFetch.mockReset().mockResolvedValue(new Response(JSON.stringify({
    code: 'Success',
    data: { task_id: '1', status: 'QUEUED', created_at: '2026-08-18T11:33:02.456421825+08:00' },
  }), { status: 200 }));
  const task = await submitTask('token', { prompt: 'x', resolution: '768p竖', duration: 5 });
  expect(task.createdAt).toBe(Date.parse('2026-08-18T11:33:02.456421825+08:00'));
});
