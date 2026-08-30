import { createAutodlComfyUiAdapter } from './adapter';

test('submits and polls the configured H3 AutoDL workflow', async () => {
  const fetcher = jest.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'Success', data: { task_id: 'remote-1', status: 'QUEUED' } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'Success', data: { status: 'SUCCESSFUL', results: [{ url: 'https://cdn.test/video' }] } }), { status: 200 }));
  const adapter = createAutodlComfyUiAdapter({ fetch: fetcher as never, token: 'token' });
  const job = await adapter.submit({ prompt: 'p', resolution: '768p竖', duration: 5 });
  expect(job.providerJobId).toBe('remote-1');
  expect(fetcher.mock.calls[0][0]).toContain('minimax_h3_image_audio_to_video_v2_15s');
  expect((await adapter.getStatus(job)).status).toBe('SUCCEEDED');
});

test('bypasses the LLM streaming fetch shim for REST workflow requests', async () => {
  const nativeFetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'Success', data: { task_id: 'remote-rest', status: 'QUEUED' } }), { status: 200 }));
  const streamingFetch = Object.assign(jest.fn(), { __originalFetch: nativeFetch });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = streamingFetch as unknown as typeof fetch;
  try {
    const adapter = createAutodlComfyUiAdapter({ token: 'token' });
    await adapter.submit({ prompt: 'p', resolution: '768p竖', duration: 5 });
    expect(nativeFetch).toHaveBeenCalledTimes(1);
    expect(streamingFetch).not.toHaveBeenCalled();
  } finally {
    globalThis.fetch = previousFetch;
  }
});
