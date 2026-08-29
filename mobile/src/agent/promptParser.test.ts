import { parsePromptResult } from './promptParser';

describe('parsePromptResult', () => {
  it('extracts a titled H3 prompt', () => {
    expect(parsePromptResult('### H3 Prompt\nA cat runs.', 'm1')).toEqual({ promptText: 'A cat runs.', sourceMessageId: 'm1', confidence: 'high' });
  });

  it('extracts a fenced prompt', () => {
    expect(parsePromptResult('```text\nA crane shot.\n```', 'm2')?.promptText).toBe('A crane shot.');
  });

  it('extracts an explicit prompt field', () => {
    expect(parsePromptResult('prompt: Soft sunrise.', 'm3')?.promptText).toBe('Soft sunrise.');
  });

  it('returns null for a non-prompt response', () => {
    expect(parsePromptResult('I need one more detail.', 'm4')).toBeNull();
  });
});
