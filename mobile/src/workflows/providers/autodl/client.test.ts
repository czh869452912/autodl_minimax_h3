import { createAutodlClient, type ProviderError } from './client';

test('uses the AutoDL REST contract for submit and poll', async () => {
  const transport = jest.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'Success', data: { task_id: 'remote-1', status: 'QUEUED' } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'Success', data: { status: 'SUCCESSFUL', results: [] } }), { status: 200 }));
  const client = createAutodlClient({ transport, token: 'token' });

  await expect(client.submit({ prompt: 'p', resolution: '768p竖', duration: 5 })).resolves.toMatchObject({ task_id: 'remote-1' });
  await expect(client.getStatus('remote-1')).resolves.toMatchObject({ status: 'SUCCESSFUL' });
  expect(transport.mock.calls[0]).toEqual([
    'https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_image_audio_to_video_v2_15s',
    expect.objectContaining({ method: 'POST', headers: { Authorization: 'token', 'Content-Type': 'application/json' } }),
  ]);
  expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual({ prompt: 'p', resolution: '768p竖', duration: 5 });
  expect(transport.mock.calls[1][0]).toBe('https://autodl.art/api/v1/comfyui/comfyui_workflow/result/remote-1');
});

test('classifies network failures as AutoDL provider errors', async () => {
  const transport = jest.fn().mockRejectedValue(new TypeError('Unable to resolve host'));
  const client = createAutodlClient({ transport, token: 'token' });

  await expect(client.submit({ prompt: 'p', resolution: '768p竖', duration: 5 })).rejects.toEqual(expect.objectContaining<Partial<ProviderError>>({ provider: 'autodl', operation: 'submit', kind: 'network' }));
});
