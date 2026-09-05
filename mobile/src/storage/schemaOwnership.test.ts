import fs from 'fs';
import path from 'path';

const allowed = new Set([
  'storage/schema.ts',
  'storage/recovery.ts',
  'storage/migrations/v5Registry.ts',
  'storage/migrations/v6DurableExecutor.ts',
  'storage/migrations/v7RegistryRelease.ts',
  'storage/migrations/v8TaskRefresh.ts',
]);

function sourceFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

test('schema and migrations are the only DDL owners', () => {
  const root = path.resolve(__dirname, '..');
  const violations = sourceFiles(root).flatMap((file) => {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    if (allowed.has(relative)) return [];
    return /\b(CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE)\b/i.test(fs.readFileSync(file, 'utf8')) ? [relative] : [];
  });
  expect(violations).toEqual([]);
});
