import * as SecureStore from 'expo-secure-store';
export type CreativeIdea = { mode: 'image' | 'video'; image: string; video: string };
const key = 'creative.home.idea';
let tail: Promise<void> = Promise.resolve();
export async function readCreativeIdea(): Promise<CreativeIdea> {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return { mode: 'image', image: '', video: '' };
  const value = JSON.parse(raw);
  if (!value || !['image','video'].includes(value.mode) || typeof value.image !== 'string' || typeof value.video !== 'string') throw new Error('首页描述读取失败，请重新打开创作页');
  return value;
}
export function writeCreativeIdea(value: CreativeIdea) {
  const payload = JSON.stringify(value);
  const next = tail.catch(() => undefined).then(() => SecureStore.setItemAsync(key, payload));
  tail = next;
  return next;
}
