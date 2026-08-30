import fs from 'node:fs';
import path from 'node:path';

function findRouteTestFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findRouteTestFiles(entryPath);
    return /\.(test|spec)\.[jt]sx?$/.test(entry.name) ? [entryPath] : [];
  });
}

describe('Expo Router route tree', () => {
  it('does not include Jest tests inside the app route directory', () => {
    const routeTests = findRouteTestFiles(path.resolve(__dirname, '..', 'app'));
    expect(routeTests).toEqual([]);
  });
});
