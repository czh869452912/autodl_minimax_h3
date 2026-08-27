export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const CUT_TIME = /At \d{2}:(?:\d{2}:)?\d{2}\.\d{3}/;

export function validateH3Prompt(prompt: string): ValidationResult {
  const errors: string[] = [];
  if (!prompt.includes('integrated_multimodal_description:')) {
    errors.push('Missing integrated_multimodal_description section');
  }
  if (!prompt.includes('overall_soundscape:')) {
    errors.push('Missing overall_soundscape section');
  }
  if (!prompt.includes('non_diegetic_music:')) {
    errors.push('Missing non_diegetic_music section');
  }
  const shotTwo = prompt.match(/\[Shot\s*2\][^\n]*/i);
  if (shotTwo && !CUT_TIME.test(shotTwo[0])) {
    errors.push('Shot 2+ cut timestamps must use At HH:MM:SS.mmm');
  }
  return { valid: errors.length === 0, errors };
}
