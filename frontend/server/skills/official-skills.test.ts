import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), 'server', 'skills', 'minimax-h3');

describe('official MiniMax H3 skills', () => {
  it('ships the prompt skill and its official reference guides', () => {
    const skill = join(root, 'h3-prompt-writing', 'SKILL.md');

    expect(existsSync(skill)).toBe(true);
    expect(readFileSync(skill, 'utf8')).toContain('name: h3-prompt-writing');
    expect(existsSync(join(root, 'h3-prompt-writing', 'references', 'base-en.txt'))).toBe(true);
    expect(existsSync(join(root, 'h3-prompt-writing', 'references', 'ref-en.txt'))).toBe(true);
  });
});
