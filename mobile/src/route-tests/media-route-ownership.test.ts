import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

test('production routes do not own media execution or projection writes', () => {
  for (const route of ['app/(tabs)/tasks.tsx', 'app/video/[id].tsx']) {
    const source = readFileSync(resolve(process.cwd(), route), 'utf8');
    expect(source).not.toMatch(/tasks\/media|exportVideo|downloadTask|updateMediaProjection|upsertDelivery/);
  }
});

test('legacy media queues and production references are removed', () => {
  const files = [...productionFiles(resolve(process.cwd(), 'app')), ...productionFiles(resolve(process.cwd(), 'src'))];
  const forbiddenImports = [/tasks\/media['"]/, /tasks\/coordinator['"]/, /tasks\/mediaQueue['"]/];
  const directExecutionOwners: Record<string, string[]> = {
    exportVideo: ['src/native/media.ts', 'src/tasks/sync.ts'],
    downloadTask: ['src/tasks/download.ts'],
  };
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const relative = file.slice(process.cwd().length + 1).replace(/\\/g, '/');
    for (const pattern of forbiddenImports) {
      expect({ file: relative, match: source.match(pattern)?.[0] }).toEqual({ file: relative, match: undefined });
    }
    for (const [symbol, owners] of Object.entries(directExecutionOwners)) {
      if (!source.includes(symbol)) continue;
      expect(owners).toContain(relative);
    }
  }

  for (const removed of ['src/tasks/media.ts', 'src/tasks/coordinator.ts', 'src/tasks/mediaQueue.ts']) {
    expect({ file: removed, exists: existsSync(resolve(process.cwd(), removed)) }).toEqual({ file: removed, exists: false });
  }
});
