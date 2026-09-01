import { getByJsonPointer, setByJsonPointer } from './jsonPointer';

test('reads RFC6901 escaped object keys and array indexes', () => {
  const value = { 'a/b': { '~key': ['zero', 'one'] } };
  expect(getByJsonPointer(value, '/a~1b/~0key/1')).toBe('one');
  expect(getByJsonPointer(value, '')).toBe(value);
});

test('rejects malformed or prototype-polluting pointers', () => {
  expect(() => getByJsonPointer({}, 'a/b')).toThrow('JSON Pointer');
  expect(() => getByJsonPointer({}, '/__proto__/x')).toThrow('unsafe');
  expect(() => getByJsonPointer({}, '/a~2b')).toThrow('escape');
});

test('sets a value without mutating the input snapshot', () => {
  const source = { nested: { value: 1 } };
  const next = setByJsonPointer(source, '/nested/value', 2);
  expect(next).toEqual({ nested: { value: 2 } });
  expect(source.nested.value).toBe(1);
});

test('rejects invalid array indexes when setting values', () => {
  expect(() => setByJsonPointer({ items: ['a'] }, '/items/foo', 'b')).toThrow('array index');
  expect(() => setByJsonPointer({ items: ['a'] }, '/items/3', 'b')).toThrow('array index');
});
