import type { CreativeProvider } from './accounts';

export async function verifyAccount(provider: CreativeProvider, token: string) {
  // ComfyUI documents no non-consuming account identity endpoint. Bind the exact
  // credential locally, record verified_at=0, and never claim remote validation.
  if (provider === 'autodl') return { namespace: 'https://www.autodl.art/api', authenticated: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('https://image.novelai.net/user/subscription', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    if (!response.ok) throw new Error(`NovelAI 凭据验证失败（${response.status}）`);
    const body = await response.json();
    if (typeof body?.active !== 'boolean' || !Number.isFinite(body?.tier)) throw new Error('NovelAI 账号响应无法验证');
    // Official account information currently exposes no stable principal ID.
    // Do not synthesize one from email, balance, or subscription tier.
    // Keep the identity namespace stable when the HTTP endpoint changes.
    return { namespace: 'https://api.novelai.net' };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NovelAI')) throw error;
    throw new Error('无法验证 NovelAI 账号，请检查网络与令牌');
  } finally { clearTimeout(timer); }
}
