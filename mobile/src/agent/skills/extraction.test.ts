import { extractSkillDraft, redactSkillEvidence, skillEvidenceText } from './extraction';

const config = { apiKey: 'transport-secret', endpoint: 'https://model.test/v1', model: 'test', timeoutMs: 1000, maxRetries: 2 };
test('extracts only selected human/assistant text and redacts secrets idempotently', () => {
  const raw = 'api_key=hidden password:abcdef Bearer secret sk-1234567890 https://example.test/?token=private user@example.test 13812345678 file:///data/private';
  const text = skillEvidenceText({ id: 'a', role: 'user', content: [{ type: 'text', text: raw }, { type: 'image', url: 'data:image/png;base64,private' }] } as never);
  expect(text).not.toMatch(/hidden|abcdef|secret|sk-123|example\.test|138123|base64|\/data/);
  expect(redactSkillEvidence(text)).toBe(text);
  expect(skillEvidenceText({ id: 'b', role: 'tool', content: 'sensitive tool result' } as never)).toBe('');
  expect(skillEvidenceText({ id: 'c', role: 'system', content: 'internal instructions' } as never)).toBe('');
});

test('one model call sees only reviewed evidence/goal, no tools, and never installs', async () => {
  const invoke = jest.fn(async () => ({ content: '```markdown\n---\nname: review-shot\ndescription: Review shots\n---\nUse a checklist.\n```' }));
  const factory = jest.fn(() => ({ invoke }));
  const controller = new AbortController();
  const result = await extractSkillDraft({ evidence: 'Check subject and action.', goal: 'Reusable shot review' }, config, controller.signal, factory as never);
  expect(result).toMatch(/^---\nname: review-shot/);
  expect(invoke).toHaveBeenCalledTimes(1);
  const calls = invoke.mock.calls as unknown as [Array<{ role: string; content: string }>, unknown][];
  expect(JSON.parse(calls[0][0][1].content)).toEqual({ evidence: 'Check subject and action.', goal: 'Reusable shot review' });
  expect(JSON.stringify(calls)).not.toContain('transport-secret');
  expect(factory).toHaveBeenCalledWith({ ...config, maxRetries: 0 });
});

test('unsanitized evidence is blocked before sending and cancellation rejects a late model response', async () => {
  let finish!: (value: { content: string }) => void;
  const invoke = jest.fn(() => new Promise<{ content: string }>(resolve => { finish = resolve; }));
  const factory = jest.fn(() => ({ invoke }));
  const controller = new AbortController();
  await expect(extractSkillDraft({ evidence: 'api_key=private', goal: 'review' }, config, controller.signal, factory as never)).rejects.toThrow('敏感');
  expect(factory).not.toHaveBeenCalled();
  const pending = extractSkillDraft({ evidence: 'review', goal: 'review' }, config, controller.signal, factory as never);
  controller.abort(); finish({ content: 'late response' });
  await expect(pending).rejects.toThrow('已取消');
});
