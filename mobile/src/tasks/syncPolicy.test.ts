import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { claimMaintenanceWindow, createExecutorSettingsCache, executorSettingsFingerprint } from './syncPolicy';
import type { AppSettings } from '../settings/storage';

const settings: AppSettings = {
  token: 'token-a',
  llmEndpoint: 'https://api.example.test/v1',
  llmModel: 'model',
  llmApiKey: 'llm-key',
  llmTimeoutSeconds: '600',
  llmMaxRetries: '2',
  autoExportToGallery: true,
  keepPrivateCopy: true,
};

test('claims a persisted five-minute maintenance window unless forced', () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    expect(claimMaintenanceWindow(db as never, 1_000, false)).toBe(true);
    expect(claimMaintenanceWindow(db as never, 1_001, false)).toBe(false);
    expect(claimMaintenanceWindow(db as never, 1_002, true)).toBe(true);
    expect(claimMaintenanceWindow(db as never, 301_001, false)).toBe(false);
    expect(claimMaintenanceWindow(db as never, 301_003, false)).toBe(true);
  } finally { db.close(); }
});

test('fingerprints only executor-relevant settings and caches constructed values', () => {
  expect(executorSettingsFingerprint({ ...settings, llmModel: 'other' })).toBe(executorSettingsFingerprint(settings));
  const build = jest.fn((value: AppSettings) => ({ token: value.token }));
  const cache = createExecutorSettingsCache(build);

  const first = cache.getOrCreate(settings);
  expect(Array.from({ length: 4 }, () => cache.getOrCreate({ ...settings }))).toEqual([first, first, first, first]);
  expect(build).toHaveBeenCalledTimes(1);
  expect(cache.getOrCreate({ ...settings, token: 'token-b' })).not.toBe(first);
  expect(cache.getOrCreate({ ...settings, token: 'token-b', keepPrivateCopy: false })).not.toEqual({ token: 'token-a' });
  expect(build).toHaveBeenCalledTimes(3);
});
