import { getDatabase } from './databaseClient';

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({ execSync: jest.fn(), getFirstSync: jest.fn(() => ({ user_version: 4 })) })),
}));

test('returns one shared database handle for the app lifetime', () => {
  const first = getDatabase();
  const second = getDatabase();
  expect(second).toBe(first);
});
