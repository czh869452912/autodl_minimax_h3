import path from 'node:path';
import { loadOfficialSkills } from './skills.js';

describe('official H3 skill bundle', () => {
  it('loads the complete multi-file skill tree from disk', async () => {
    const files = await loadOfficialSkills(path.resolve(__dirname, '../skills/minimax-h3'));
    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      '/skills/h3-prompt-writing/SKILL.md',
      '/skills/h3-prompt-writing/references/base-en.txt',
    ]));
    expect(Object.keys(files).length).toBeGreaterThan(20);
    expect(files['/skills/h3-prompt-writing/SKILL.md']).toContain('MiniMax H3');
  });
});
