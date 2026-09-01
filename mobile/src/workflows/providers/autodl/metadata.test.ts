import fixture from './fixtures/h3-metadata.json';
import { get } from 'node:https';
import { fetchAutodlWorkflowMetadata, parseAutodlWorkflowMetadata } from './metadata';

test('accepts the stable H3 slot/range/MIME contract', () => {
  const metadata = parseAutodlWorkflowMetadata(fixture);
  expect(metadata.workflowId).toBe('minimax_h3_image_audio_to_video_v2_15s');
  expect(metadata.inputRules.ref_image_0.acceptTypes).toContain('image/webp');
  expect(metadata.inputRules.ref_audio_2.acceptTypes).toContain('audio/flac');
  expect(metadata.inputRules.duration.minimum).toBe(1);
  expect(metadata.inputRules.duration.maximum).toBe(15);
});

test('rejects metadata that removes the zero slot or changes duration bounds', () => {
  expect(() => parseAutodlWorkflowMetadata({ ...fixture, data: { ...fixture.data, input_rules: { ...fixture.data.input_rules, ref_image_0: undefined } } })).toThrow('ref_image_0');
  expect(() => parseAutodlWorkflowMetadata({ ...fixture, data: { ...fixture.data, input_rules: { ...fixture.data.input_rules, duration: { type: 'integer', min: 1, max: 30 } } } })).toThrow('duration');
});

test('fetches the wrapped metadata response without sending a credential', async () => {
  const transport = jest.fn().mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));
  const value = await fetchAutodlWorkflowMetadata({ transport });
  expect(value.workflowId).toBe('minimax_h3_image_audio_to_video_v2_15s');
  expect(transport.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  expect(transport.mock.calls[0][1]).not.toHaveProperty('headers.Authorization');
});

test('rejects failed HTTP and malformed metadata responses', async () => {
  const failed = jest.fn().mockResolvedValue(new Response('{"code":"Error"}', { status: 500 }));
  await expect(fetchAutodlWorkflowMetadata({ transport: failed })).rejects.toThrow('HTTP 500');
  const malformed = jest.fn().mockResolvedValue(new Response('{not-json', { status: 200 }));
  await expect(fetchAutodlWorkflowMetadata({ transport: malformed })).rejects.toThrow('not valid JSON');
});

const liveTest = process.env.AUTODL_CONTRACT_LIVE === '1' ? test : test.skip;
liveTest('matches the public live H3 metadata contract', async () => {
  const transport = async (url: RequestInfo | URL): Promise<Response> => new Promise((resolve, reject) => {
    const request = get(String(url), (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers as HeadersInit })));
    });
    request.on('error', reject);
  });
  const value = await fetchAutodlWorkflowMetadata({ transport });
  expect(value.inputRules.ref_image_0.acceptTypes).toContain('image/png');
  expect(value.inputRules.ref_audio_2.acceptTypes).toContain('audio/wav');
});
