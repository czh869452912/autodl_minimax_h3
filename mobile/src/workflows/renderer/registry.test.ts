import { createDefaultRendererRegistry } from './registry';

test('registers only the native semantic renderers', () => {
  const registry = createDefaultRendererRegistry();
  expect(registry.has('prompt')).toBe(true);
  expect(registry.has('enum')).toBe(true);
  expect(registry.has('image[]')).toBe(true);
  expect(registry.has('evil' as never)).toBe(false);
});
