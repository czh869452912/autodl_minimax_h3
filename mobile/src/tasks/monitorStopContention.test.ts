import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRealSqliteTestDb } from '../test/realSqlite';
import { ensureAppDatabase } from '../storage/database';
import { createMonitorQueue } from './monitorQueue';
import { createTaskCommandService } from './taskCommandService';

test('idle stop holds the SQLite writer lock through native acknowledgement, even in WAL mode', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-stop-'));
  const filename = path.join(directory, 'app.db');
  const db = createRealSqliteTestDb(filename, { independentTransactions: true });
  const writer = createRealSqliteTestDb(filename);
  ensureAppDatabase(db as never);
  db.execSync('PRAGMA journal_mode=WAL');
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const stop = createMonitorQueue(db as never).stopIfIdle(0, async () => { entered(); await hold; return true; });
  try {
    await started;
    expect(() => writer.runSync('UPDATE executor_wake_state SET generation=generation+1 WHERE singleton=1')).toThrow(/locked|busy/i);
    release();
    expect(await stop).toBe(true);
    const command = createTaskCommandService({ db: db as never, fileExists: async () => false, resolveCasUri: p => p, invalidate: () => undefined, signal: () => undefined });
    await command.requestRefresh({ maintenance: 'force-next-slice' });
    const secondStop = jest.fn(async () => true);
    expect(await createMonitorQueue(db as never).stopIfIdle(0, secondStop)).toBe(false);
    expect(secondStop).not.toHaveBeenCalled();
  } finally { release(); await stop; writer.close(); db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
