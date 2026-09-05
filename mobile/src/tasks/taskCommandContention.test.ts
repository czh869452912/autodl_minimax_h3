import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRealSqliteTestDb } from '../test/realSqlite';
import { ensureAppDatabase } from '../storage/database';
import { createTaskCommandService } from './taskCommandService';

test('manual refresh survives an independent SQLite writer without losing or duplicating its durable wake', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-contention-'));
  const filename = path.join(directory, 'app.db');
  const db = createRealSqliteTestDb(filename, { independentTransactions: true });
  ensureAppDatabase(db as never);
  const writer = createRealSqliteTestDb(filename);
  const invalidate = jest.fn();
  const signal = jest.fn();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    writer.execSync('BEGIN IMMEDIATE');
    writer.runSync('UPDATE executor_wake_state SET generation=generation+1 WHERE singleton=1');
    timer = setTimeout(() => writer.execSync('COMMIT'), 60);
    const command = createTaskCommandService({ db: db as never, fileExists: async () => false, resolveCasUri: p => p, invalidate, signal });
    expect(await command.requestRefresh({ maintenance: 'force-next-slice' })).toMatchObject({ status: 'accepted', wakeGeneration: 2 });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(signal).toHaveBeenCalledTimes(1);
    expect(db.getFirstSync('SELECT generation FROM executor_wake_state')).toEqual({ generation: 2 });
  } finally {
    if (timer) clearTimeout(timer);
    try { writer.execSync('ROLLBACK'); } catch { /* already committed */ }
    writer.close(); db.close(); fs.rmSync(directory, { recursive: true, force: true });
  }
});
