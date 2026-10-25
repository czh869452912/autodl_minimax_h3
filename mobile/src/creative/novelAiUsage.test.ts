import { fetchNovelAiUsage, parseNovelAiUsage } from './novelAiUsage';

test('subscription balances and usage limit remain separate, including zero and over-cap values', () => {
  expect(parseNovelAiUsage({ active: true, tier: 3, trainingStepsLeft: { fixedTrainingStepsLeft: 0, purchasedTrainingSteps: 15 }, usage: { percent: 125, purchasedPercent: 25, isNegative: false, timeUntilNextPercent: 0 } }, 100)).toEqual({
    active: true, tier: 3, fixedAnlas: 0, purchasedAnlas: 15, anlas: 15,
    limit: { percent: 125, purchasedPercent: 25, unavailable: false, nextPercentSeconds: 0 }, fetchedAt: 100,
  });
});
test('missing or malformed values are unknown, never free or unlimited', () => {
  const value = parseNovelAiUsage({ active: false, tier: 0, trainingStepsLeft: { fixedTrainingStepsLeft: 10 }, usage: { percent: '100', isNegative: false } });
  expect(value.anlas).toBeNull(); expect(value.limit).toBeNull();
  expect(() => parseNovelAiUsage({ active: true })).toThrow();
  expect(parseNovelAiUsage({ active: true, tier: 3, usage: { percent: 0, isNegative: true } }).limit).toMatchObject({ percent: 0, unavailable: true });
});
test('read-only request reports auth errors without leaking response bodies or the token', async () => {
  const original = global.fetch;
  try {
    global.fetch = jest.fn(async () => ({ ok: false, status: 401 })) as any;
    await expect(fetchNovelAiUsage('secret')).rejects.toThrow('令牌已失效');
    expect(global.fetch).toHaveBeenCalledWith('https://image.novelai.net/user/subscription', expect.objectContaining({ headers: { Authorization: 'Bearer secret' } }));
  } finally { global.fetch = original; }
});
