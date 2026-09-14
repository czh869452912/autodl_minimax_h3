import * as SecureStore from 'expo-secure-store';
import { readSettingsDraft, writeSettingsDraft } from './draft';
import type { AppSettings } from './storage';
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(async () => undefined) }));
test('serializes encrypted writes so late drafts cannot overwrite the saved state', async () => {
  let release!: () => void;
  jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const draft = writeSettingsDraft({ token: 'private-test-token' } as AppSettings);
  const clear = writeSettingsDraft();
  await Promise.resolve(); await Promise.resolve();
  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  release(); await draft; await clear;
  expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith('settings.pendingDraft', '');
});
test('validates recovered draft keys and types before merging into settings', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('{"token":"draft","keepPrivateCopy":false}');
  expect(await readSettingsDraft()).toEqual({ token: 'draft', keepPrivateCopy: false });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('{"token":42}');
  await expect(readSettingsDraft()).rejects.toThrow('格式');
});
