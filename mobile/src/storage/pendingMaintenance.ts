import * as SecureStore from 'expo-secure-store';
export type PendingMaintenance = { kind: 'reset' } | { kind: 'restore'; backup: string };
export class InvalidMaintenanceRequestError extends Error {}
const KEY = 'database.pendingMaintenance';
export async function readPendingMaintenance(): Promise<PendingMaintenance | undefined> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return undefined;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new InvalidMaintenanceRequestError('数据维护请求损坏'); }
  if (!value || typeof value !== 'object') throw new InvalidMaintenanceRequestError('数据维护请求无效');
  const request = value as Partial<{ kind: string; backup: string }>;
  if (request.kind === 'reset' || (request.kind === 'restore' && typeof request.backup === 'string' && request.backup.length > 0)) return request as PendingMaintenance;
  throw new InvalidMaintenanceRequestError('数据维护请求无效');
}
export const scheduleMaintenance = (value?: PendingMaintenance) => SecureStore.setItemAsync(KEY, value ? JSON.stringify(value) : '');
