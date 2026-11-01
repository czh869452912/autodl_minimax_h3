import * as SecureStore from 'expo-secure-store';
import { readSettingsDraft, writeSettingsDraft } from './draft';
import type { AppSettings } from './storage';
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(async () => undefined) }));
test('serializes encrypted writes so late drafts cannot overwrite the saved state', async () => {
  let release!: () => void;
  jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const draft = writeSettingsDraft({ llmApiKey: 'private-test-key' } as AppSettings);
  const clear = writeSettingsDraft();
  await Promise.resolve(); await Promise.resolve();
  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  release(); await draft; await clear;
  expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith('settings.pendingDraft', '');
});
test('validates recovered draft keys and types before merging into settings', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('{"token":"draft","keepPrivateCopy":false}');
  expect(await readSettingsDraft()).toEqual({ keepPrivateCopy: false });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('{"llmApiKey":42}');
  await expect(readSettingsDraft()).rejects.toThrow('格式');
});

test('explicit identity is not serialized into a preference draft or restored as credentials',async()=>{
 await writeSettingsDraft({llmConnectionId:'A',llmConnectionRevision:1,llmSupportsImages:true,llmEndpoint:'https://example.test',llmModel:'test',llmApiKey:'connection-secret',llmMaxRetries:'4'} as AppSettings);
 const payload=jest.mocked(SecureStore.setItemAsync).mock.calls.at(-1)![1];expect(JSON.parse(payload)).toEqual({llmMaxRetries:'4'});
 jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(payload);expect(await readSettingsDraft()).toEqual({llmMaxRetries:'4'});
});
