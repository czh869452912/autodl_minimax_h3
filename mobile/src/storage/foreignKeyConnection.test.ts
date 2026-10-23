import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRealSqliteTestDb } from '../test/realSqlite';
import { withForeignKeyConnections } from './foreignKeyConnection';

test('every new connection enforces references and rolls back failed transactions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'creative-fk-'));
  const path = join(directory, 'db.sqlite');
  const raw = createRealSqliteTestDb(path);
  raw.execSync('CREATE TABLE parent(id TEXT PRIMARY KEY); CREATE TABLE child(id TEXT PRIMARY KEY,parent_id TEXT REFERENCES parent(id));');
  let closed = 0;
  const db = withForeignKeyConnections(raw as never, async () => {
    const tx = createRealSqliteTestDb(path);
    tx.execSync('PRAGMA foreign_keys=OFF');
    return Object.assign(tx, { closeAsync: async () => { closed++; tx.close(); } }) as never;
  });
  try {
    await db.withExclusiveTransactionAsync(async tx => { await tx.runAsync("INSERT INTO parent VALUES('p')"); await tx.runAsync("INSERT INTO child VALUES('c','p')"); });
    await expect(db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync("INSERT INTO parent VALUES('rollback')");
      await tx.runAsync("DELETE FROM parent WHERE id='p'");
    })).rejects.toThrow(/FOREIGN KEY/);
    expect(raw.getAllSync('SELECT id FROM parent')).toEqual([{ id: 'p' }]);
    expect(raw.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
    expect(closed).toBe(2);
  } finally { raw.close(); rmSync(directory, { recursive: true, force: true }); }
});
