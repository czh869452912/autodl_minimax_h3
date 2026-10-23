import * as SecureStore from 'expo-secure-store';
import { getDatabase } from '../storage/databaseClient';
import { createCreativeAccounts, type CreativeProvider } from './accounts';
import { createCreativeBudget } from './budget';

async function verifyAccount(provider: CreativeProvider, token: string) {
  if (provider !== 'novelai') throw new Error('此服务的账号验证尚未接入');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('https://api.novelai.net/user/subscription', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    if (!response.ok) throw new Error(`NovelAI 凭据验证失败（${response.status}）`);
    const body = await response.json();
    if (typeof body?.active !== 'boolean' || !Number.isFinite(body?.tier)) throw new Error('NovelAI 账号响应无法验证');
    // Official account information currently exposes no stable principal ID.
    // Do not synthesize one from email, balance, or subscription tier.
    return { namespace: 'https://api.novelai.net' };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NovelAI')) throw error;
    throw new Error('无法验证 NovelAI 账号，请检查网络与令牌');
  } finally { clearTimeout(timer); }
}
export const creativeAccounts = () => createCreativeAccounts(getDatabase(), {
  now: Date.now, verify: verifyAccount,
  secrets: { get: SecureStore.getItemAsync, set: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }), remove: SecureStore.deleteItemAsync },
});
export const creativeBudget = () => createCreativeBudget(getDatabase());
