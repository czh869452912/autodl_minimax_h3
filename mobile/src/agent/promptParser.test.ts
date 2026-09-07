import { parsePromptCandidates, parsePromptResult, removePromptCandidateRanges } from './promptParser';
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

it('returns all candidates with UTF-16 ranges while preserving prose and other fences', () => {
  const first = '```h3-prompt\n' + prompt + '\n```';
  const second = '~~~h3-prompt\n' + prompt + '\n~~~';
  const content = '说明 😀\n' + first + '\nBetween\n```text\nexample\n```\n' + second + '\nAfter';
  const candidates = parsePromptCandidates(content, 'message', 7);
  expect(candidates).toHaveLength(2);
  expect(candidates.map(candidate => content.slice(candidate.range.start, candidate.range.end))).toEqual([first, second]);
  expect(candidates[0].id).not.toBe(candidates[1].id);
  expect(candidates.map(candidate => candidate.sourceRevision)).toEqual([7, 7]);
  expect(parsePromptCandidates(content, 'message', 7)).toEqual(candidates);
  expect(parsePromptCandidates(content, 'message', 8)[0].id).not.toBe(candidates[0].id);
  expect(parsePromptResult(content, 'message')).toBeNull();
  expect(removePromptCandidateRanges(content, candidates, [candidates[0].id])).toBe(content.replace(first, ''));
});

it.each(['```', '~~~'])('parses a titled %s block without truncating internal Markdown headings', marker => {
  const body = prompt.replace('A cat runs.', 'A cat runs.\n# Shot details\nRuns left.');
  const content = `Before\n### H3 Prompt\n${marker}text\n${body}\n${marker}\nAfter`;
  const candidates = parsePromptCandidates(content, 'm');
  expect(candidates).toHaveLength(1);
  expect(candidates[0].promptText).toBe(body);
  expect(removePromptCandidateRanges(content, candidates, [candidates[0].id])).toBe('Before\n\nAfter');
  expect(parsePromptResult(content, 'm')?.promptText).toBe(body);
});
