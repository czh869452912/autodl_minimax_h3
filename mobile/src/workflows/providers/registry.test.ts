import { createBuiltinProviderAdapters } from './registry';

test('registers AutoDL without making runtime aware of provider transport details', () => {
  const transport = jest.fn();
  const extra = { manifest: () => ({ id: 'novelai' }) } as never;
  const adapters = createBuiltinProviderAdapters({ token: 'token', transport, additional: [extra] });
  expect(adapters.get('autodl-comfyui')?.manifest().id).toBe('autodl-comfyui');
  expect(adapters.get('novelai')?.manifest().id).toBe('novelai');
});
