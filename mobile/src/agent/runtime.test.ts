import { normalizeCumulativeText, officialSkillCount } from './runtime';

describe('assistant runtime contracts', () => {
  it('normalizes cumulative provider text into a delta', () => {
    expect(normalizeCumulativeText('hello', 'hello world')).toEqual({ previous: 'hello world', delta: ' world' });
    expect(normalizeCumulativeText('hello', 'reset')).toEqual({ previous: 'reset', delta: 'reset' });
  });

  it('bundles the complete official skill set', () => {
    expect(officialSkillCount()).toBeGreaterThanOrEqual(6);
  });
});
