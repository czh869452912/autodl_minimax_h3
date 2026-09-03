import { createAutodlComfyUiAdapter } from './adapter';

test('submits and polls the configured H3 AutoDL workflow', async () => {
  const fetcher = jest.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'Success', data: { task_id: 'remote-1', status: 'QUEUED' } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'Success', data: { status: 'SUCCESSFUL', results: [{ url: 'https://cdn.test/video' }] } }), { status: 200 }));
  const adapter = createAutodlComfyUiAdapter({ transport: fetcher as never, token: 'token' });
  const job = await adapter.submit({ prompt: 'p', resolution: '768p竖', duration: 5 });
  expect(job.providerJobId).toBe('remote-1');
  expect(fetcher.mock.calls[0][0]).toContain('minimax_h3_image_audio_to_video_v2_15s');
  expect((await adapter.getStatus(job)).status).toBe('SUCCEEDED');
});

test('requires an explicit provider transport instead of the global LLM fetch', async () => {
  const transport = jest.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'Success', data: { task_id: 'remote-rest', status: 'QUEUED' } }), { status: 200 }));
  const adapter = createAutodlComfyUiAdapter({ transport, token: 'token' });
  await adapter.submit({ prompt: 'p', resolution: '768p竖', duration: 5 });
  expect(transport).toHaveBeenCalledTimes(1);
});

test('normalizes provider start time and execution duration', async () => {
  const transport = jest.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'Success', data: { status: 'SUCCESSFUL', started_at: '2026-08-31 10:00:05', duration: 42, results: [] } }), { status: 200 }));
  const adapter = createAutodlComfyUiAdapter({ transport, token: 'token' });
  await expect(adapter.getStatus({ providerJobId: 'remote-1' })).resolves.toMatchObject({
    startedAt: Date.parse('2026-08-31T10:00:05+08:00'),
    executionDuration: 42,
  });
});

test('rejects an opaque handle without a non-empty provider job id', async () => {
  const transport = jest.fn();
  const adapter = createAutodlComfyUiAdapter({ transport, token: 'token' });
  await expect(adapter.getStatus({ region: 'unknown' })).rejects.toThrow('任务句柄无效');
  await expect(adapter.getStatus({ providerJobId: '   ' })).rejects.toThrow('任务句柄无效');
  expect(transport).not.toHaveBeenCalled();
});
