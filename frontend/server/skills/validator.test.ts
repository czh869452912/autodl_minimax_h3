import { describe, expect, it } from 'vitest';
import { validateH3Prompt } from './validator';

describe('validateH3Prompt', () => {
  it('accepts a complete H3 prompt', () => {
    const result = validateH3Prompt(`integrated_multimodal_description: [Shot 1] cinematic medium shot, dolly-in, 0.5m, slow.\n[Shot 2] At 00:03.500, tracking shot, 2m, fast.\n\noverall_soundscape: rain and footsteps\n\nnon_diegetic_music: ambient synth`);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports missing audio separation and malformed cut time', () => {
    const result = validateH3Prompt('integrated_multimodal_description: [Shot 1] a scene\n[Shot 2] missing time\noverall_soundscape: rain');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing non_diegetic_music section');
    expect(result.errors).toContain('Shot 2+ cut timestamps must use At HH:MM:SS.mmm');
  });
});
