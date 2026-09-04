import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('production routes do not own media execution or projection writes', () => {
  for (const route of ['app/(tabs)/tasks.tsx', 'app/video/[id].tsx']) {
    const source = readFileSync(resolve(process.cwd(), route), 'utf8');
    expect(source).not.toMatch(/tasks\/media|exportVideo|downloadTask|updateMediaProjection|upsertDelivery/);
  }
});
