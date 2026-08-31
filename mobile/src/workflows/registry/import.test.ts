import { parseWorkflowImport } from './import';

test('normalizes JSON and YAML imports into the same object', () => {
  const json = parseWorkflowImport('{"schemaVersion":"1.0","id":"demo","version":"1.0.0","kind":"atomic"}', 'json');
  const yaml = parseWorkflowImport('schemaVersion: "1.0"\nid: demo\nversion: 1.0.0\nkind: atomic\n', 'yaml');
  expect(json).toEqual(yaml);
});

test('rejects oversized and unsafe YAML imports', () => {
  expect(() => parseWorkflowImport('x'.repeat(1001), 'json', { maxBytes: 1000 })).toThrow('too large');
  expect(() => parseWorkflowImport('!!js/function >\n  function () {}', 'yaml')).toThrow();
});
