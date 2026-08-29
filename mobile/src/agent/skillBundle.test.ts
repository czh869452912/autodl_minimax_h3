import { officialH3SkillManifest, officialH3Skills, getOfficialH3SkillFiles } from './skillBundle';

describe('official H3 skill bundle', () => {
  it('contains the complete multi-file skill tree', () => {
    const paths = Object.keys(officialH3Skills);
    expect(paths.filter((path) => path.endsWith('/SKILL.md'))).toHaveLength(9);
    expect(paths).toContain('/skills/h3-prompt-writing/references/base-en.txt');
    expect(paths).toContain('/skills/h3-prompt-writing/references/ref-en.txt');
    expect(Object.keys(officialH3SkillManifest)).toEqual(expect.arrayContaining(paths));
  });

  it('returns a fresh mutable file map for each agent run', () => {
    const first = getOfficialH3SkillFiles();
    const second = getOfficialH3SkillFiles();
    expect(first).not.toBe(second);
    expect(first['/skills/h3-prompt-writing/SKILL.md']).not.toBe(second['/skills/h3-prompt-writing/SKILL.md']);
  });

  it('normalizes flow-style trigger arrays for the Hermes YAML parser', () => {
    const files = getOfficialH3SkillFiles();
    const content = files['/skills/handdrawn-live-video-generator/SKILL.md'].content as string;
    expect(content).toMatch(/trigger-words:\n\s+- "手绘发光动画实拍融合"/);
    expect(content).not.toMatch(/trigger-words:\s*\[/);
  });
});
