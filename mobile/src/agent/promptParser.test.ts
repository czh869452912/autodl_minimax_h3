import { parsePromptResult } from './promptParser';
const prompt = 'integrated_multimodal_description: A cat runs.\noverall_soundscape: Wind.\nnon_diegetic_music: None.';
describe('parsePromptResult', () => {
  it('extracts a dedicated H3 artifact without its fence', () => {
    expect(parsePromptResult('```h3-prompt\n' + prompt + '\n```', 'm1')).toEqual({ promptText: prompt, sourceMessageId: 'm1', confidence: 'high' });
  });
  it('accepts a clearly titled legacy H3 result containing required fields', () => {
    expect(parsePromptResult('### H3 Prompt\n```text\n' + prompt + '\n```', 'm2')?.promptText).toBe(prompt);
  });
  it.each([
    '```text\nA crane shot.\n```',
    'Example only:\n```text\n' + prompt + '\n```',
    'prompt: Soft sunrise.',
    '### H3 Prompt\nA cat runs.',
    'Example only:\n```text\nH3 Prompt\n' + prompt + '\n```',
    'Example only:\n```text\nH3 Prompt\n' + prompt,
    'Example only:\n~~~text\nH3 Prompt\n' + prompt + '\n~~~',
    'Example only:\n````text\n```\nH3 Prompt\n' + prompt + '\n````',
    '```h3-prompt\nintegrated_multimodal_description: A cat runs.\n```',
    '```h3-prompt\nintegrated_multimodal_description: A cat runs.\noverall_soundscape:\nnon_diegetic_music: None.\n```',
    '```h3-prompt\nintegrated_multimodal_description: \n```',
    '```h3-prompt\n' + prompt,
    'I need one more detail.',
  ])('rejects examples, incomplete fences and non-H3 content: %s', (content) => {
    expect(parsePromptResult(content, 'm3')).toBeNull();
  });
  it('supports the official full-reference format', () => {
    const reference = 'subject_definitions: Cat from <Picture 1>.\nsummary: Cat runs.\nretention_analysis: Keep cat.\ndetailed_description: Cat runs left.\noverall_soundscape: Wind.\nnon_diegetic_music: None.';
    expect(parsePromptResult('```h3-prompt\n' + reference + '\n```', 'r')?.promptText).toBe(reference);
  });
});
