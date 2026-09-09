const mockGetDatabase = jest.fn();
const mockAssert = jest.fn();
const mockAssertAsync = jest.fn();
const mockCreateCatalog = jest.fn(() => ({ listActive: jest.fn(async () => []) }));
const mockRunSlice = jest.fn(async () => ({ remainingDue: 0 }));
const mockCreateRunner = jest.fn(() => ({ runSlice: mockRunSlice }));
jest.mock('./executorRunner', () => ({ createExecutorRunner: () => mockCreateRunner() }));
jest.mock('../workflows/registry/builtin', () => ({ createAppWorkflowCatalog: () => mockCreateCatalog() }));
jest.mock('../storage/databaseClient', () => ({ getDatabase: () => mockGetDatabase() }));
jest.mock('../storage/database', () => ({
  ...jest.requireActual('../storage/database'),
  assertAppDatabaseWritable: (...args: unknown[]) => mockAssert(...args),
  assertAppDatabaseWritableAsync: (...args: unknown[]) => mockAssertAsync(...args),
}));

test('importing services opens no database; headless admission rejects readonly before constructing repositories', async () => {
  const { getTaskServices } = require('./taskServices') as typeof import('./taskServices');
  const { executorRunner } = require('./executorRuntime') as typeof import('./executorRuntime');
  require('../create/createServices');
  expect(mockGetDatabase).not.toHaveBeenCalled();
  // No SQL API exists on this handle: construction or work before admission fails the test.
  mockGetDatabase.mockReturnValue(Object.freeze({}));
  mockAssert.mockImplementation(() => { throw new Error('APP_DATABASE_READ_ONLY'); });
  mockAssertAsync.mockRejectedValue(new Error('APP_DATABASE_READ_ONLY'));
  expect(() => getTaskServices()).toThrow('APP_DATABASE_READ_ONLY');
  await expect(executorRunner.runSlice({ trigger: 'background' })).rejects.toThrow('APP_DATABASE_READ_ONLY');
  await expect(executorRunner.runSlice({ trigger: 'service' })).rejects.toThrow('APP_DATABASE_READ_ONLY');
});

test('create catalog is stable per database and rebuilt after maintenance replaces the handle', async () => {
  const { defaultSubmissionDependencies } = require('../create/createServices') as typeof import('../create/createServices');
  mockAssert.mockReset();
  const first = {};
  mockGetDatabase.mockReturnValue(first);
  await defaultSubmissionDependencies.catalog.listActive();
  await defaultSubmissionDependencies.catalog.listActive();
  expect(mockCreateCatalog).toHaveBeenCalledTimes(1);
  mockGetDatabase.mockReturnValue({});
  await defaultSubmissionDependencies.catalog.listActive();
  expect(mockCreateCatalog).toHaveBeenCalledTimes(2);
});

test('concurrent first admission resolving out of order still constructs one executor', async () => {
  const { executorRunner } = require('./executorRuntime') as typeof import('./executorRuntime');
  const { createInitializedRealSqliteTestDb } = require('../test/realSqlite') as typeof import('../test/realSqlite');
  const db = createInitializedRealSqliteTestDb();
  const admits: Array<() => void> = [];
  mockGetDatabase.mockReturnValue(db);
  mockAssertAsync.mockImplementation(() => new Promise<void>(resolve => admits.push(resolve)));
  try {
    const first = executorRunner.runSlice({ trigger: 'background' });
    const second = executorRunner.runSlice({ trigger: 'service' });
    expect(mockCreateRunner).not.toHaveBeenCalled();
    admits[1]();
    await second;
    admits[0]();
    await first;
    expect(mockCreateRunner).toHaveBeenCalledTimes(1);
    expect(mockRunSlice).toHaveBeenCalledTimes(2);
  } finally { db.close(); }
});
