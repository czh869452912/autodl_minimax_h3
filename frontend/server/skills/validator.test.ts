import { describe, expect, it } from 'vitest';
import { validateH3Prompt } from './validator';
import { discoverH3Skill } from './manifest';
import { runH3Graph } from '../graph/h3Graph';

describe('H3 Skill Discovery & Manifest', () => {
  it('correctly discovers t2va for 0 images', () => {
    const skill = discoverH3Skill(0);
    expect(skill.name).toBe('t2va');
  });

  it('correctly discovers i2va for 1 image', () => {
    const skill = discoverH3Skill(1);
    expect(skill.name).toBe('i2va');
  });

  it('correctly discovers fl2va for 2 images', () => {
    const skill = discoverH3Skill(2);
    expect(skill.name).toBe('fl2va');
  });

  it('correctly discovers ref2va for 3+ images', () => {
    const skill = discoverH3Skill(3);
    expect(skill.name).toBe('ref2va');
  });
});

describe('validateH3Prompt', () => {
  it('accepts a complete H3 prompt', () => {
    const result = validateH3Prompt(
      `integrated_multimodal_description: [Shot 1] cinematic medium shot, dolly-in, 0.5m, slow.\n[Shot 2] At 00:03.500, tracking shot, 2m, fast.\n\noverall_soundscape: rain and footsteps\n\nnon_diegetic_music: ambient synth`
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports missing audio separation and malformed cut time', () => {
    const result = validateH3Prompt(
      'integrated_multimodal_description: [Shot 1] a scene\n[Shot 2] missing time\noverall_soundscape: rain'
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing non_diegetic_music section');
    expect(result.errors).toContain('Shot 2+ cut timestamps must use At HH:MM:SS.mmm');
  });
});

describe('runH3Graph', () => {
  it('executes full state graph and produces valid final prompt for text prompt', async () => {
    const result = await runH3Graph('Cyberpunk rain highway pursuit', 0);
    expect(result.skill).toBe('t2va');
    expect(result.finalPrompt).toContain('integrated_multimodal_description:');
    expect(result.finalPrompt).toContain('overall_soundscape:');
    expect(result.finalPrompt).toContain('non_diegetic_music:');
    expect(result.validationErrors).toEqual([]);
  });

  it('executes full state graph for image anchor prompt', async () => {
    const result = await runH3Graph('Camera pans right from keyframe anchor', 1);
    expect(result.skill).toBe('i2va');
    expect(result.finalPrompt).toContain('<Picture 1>');
    expect(result.finalPrompt).toContain('At 00:03.500');
    expect(result.validationErrors).toEqual([]);
  });
});

