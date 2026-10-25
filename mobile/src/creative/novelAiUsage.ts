// Contract: official-openapi.json, user.SubscriptionResponse / usagelimit.Status.
export type NovelAiUsage = {
  active: boolean; tier: number; anlas: number | null;
  fixedAnlas: number | null; purchasedAnlas: number | null;
  limit: { percent: number; purchasedPercent: number | null; unavailable: boolean; nextPercentSeconds: number | null } | null;
  fetchedAt: number;
};
const amount = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export function parseNovelAiUsage(body: any, now = Date.now()): NovelAiUsage {
  if (typeof body?.active !== 'boolean' || !Number.isInteger(body?.tier)) throw new Error('NovelAI 用量响应格式异常');
  const fixedAnlas = amount(body.trainingStepsLeft?.fixedTrainingStepsLeft);
  const purchasedAnlas = amount(body.trainingStepsLeft?.purchasedTrainingSteps);
  const percent = amount(body.usage?.percent);
  return {
    active: body.active, tier: body.tier, fixedAnlas, purchasedAnlas,
    anlas: fixedAnlas !== null && purchasedAnlas !== null ? fixedAnlas + purchasedAnlas : null,
    limit: percent !== null && typeof body.usage?.isNegative === 'boolean' ? {
      percent, unavailable: body.usage.isNegative,
      purchasedPercent: amount(body.usage.purchasedPercent),
      nextPercentSeconds: amount(body.usage.timeUntilNextPercent),
    } : null,
    fetchedAt: now,
  };
}
export async function fetchNovelAiUsage(token: string, signal?: AbortSignal): Promise<NovelAiUsage> {
  const response = await fetch('https://image.novelai.net/user/subscription', { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'NovelAI 令牌已失效，请在账号设置中重新连接' : `用量获取失败（${response.status}），请重试`);
  return parseNovelAiUsage(await response.json());
}
