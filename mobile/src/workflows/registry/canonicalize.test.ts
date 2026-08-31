import { canonicalizeDefinition } from './canonicalize';

test('canonicalizes objects independently of key order', () => {
  expect(canonicalizeDefinition({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
});

test('rejects undefined and non-finite values', () => {
  expect(() => canonicalizeDefinition({ value: undefined })).toThrow('unsupported canonical value');
  expect(() => canonicalizeDefinition({ value: Number.NaN })).toThrow('unsupported canonical value');
});
