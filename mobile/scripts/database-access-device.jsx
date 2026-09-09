// Opt-in Android QA entry. Only unique fixture databases are written.
import '../src/runtimeCompatibility';
import React, { useEffect, useState } from 'react';
import { registerRootComponent } from 'expo';
import { Text, View } from 'react-native';
import { openDatabaseSync, deleteDatabaseSync } from 'expo-sqlite';
import { protectDatabase } from '../src/storage/databaseAccess';
import { ensureAppDatabase, resetAppDatabase } from '../src/storage/database';
import { markRecovery } from '../src/storage/recovery';
import { APP_SCHEMA_VERSION } from '../src/storage/schema';
import { createReleaseBackup, restoreFullDatabaseBackup } from '../src/storage/backup';

async function run() {
  const name = `database-access-qa-${Date.now()}.db`;
  const raw = openDatabaseSync(name, { useNewConnection: true });
  let backup;
  const checks = [];
  const assert = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
  const rejects = async (work, label) => {
    let rejected = false;
    try { await work(); } catch (error) { rejected = String(error).includes('APP_DATABASE_READ_ONLY'); }
    assert(rejected, label);
  };
  try {
    ensureAppDatabase(raw);
    const db = protectDatabase(raw, { startupDiagnostic: () => undefined });
    await db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync("INSERT INTO tasks(id,prompt,status,resolution,duration,created_at,updated_at) VALUES('qa','p','QUEUED','768p',5,1,1)");
    });
    assert(raw.getAllSync('SELECT id FROM tasks').length === 1, 'exclusive connection writable');
    const statement = await db.prepareAsync('DELETE FROM tasks');
    backup = createReleaseBackup(db, 'access-qa', 'a'.repeat(64));
    markRecovery(db, 'QA_RECOVERY', 1);
    await rejects(() => statement.executeAsync(), 'pre-acquired statement blocked');
    await statement.finalizeAsync();
    await rejects(() => db.getFirstAsync('DELETE FROM tasks RETURNING id'), 'query write blocked');
    await rejects(() => db.withExclusiveTransactionAsync(tx => tx.runAsync('DELETE FROM tasks')), 'exclusive connection blocked');
    resetAppDatabase(db);
    assert(raw.getAllSync('SELECT id FROM tasks').length === 0, 'reset rebuilds schema');
    restoreFullDatabaseBackup(db, backup);
    assert(raw.getAllSync('SELECT id FROM tasks').length === 1, 'backup restores guarded handle');
    raw.execSync(`PRAGMA user_version=${APP_SCHEMA_VERSION + 1}`);
    await rejects(() => db.execAsync('DELETE FROM tasks'), 'future schema blocked');
    await rejects(() => resetAppDatabase(db), 'future reset blocked');
    return { status: 'passed', checks };
  } finally {
    raw.closeSync();
    deleteDatabaseSync(name);
    if (backup) deleteDatabaseSync(backup);
  }
}
function DatabaseAccessQa() {
  const [result, setResult] = useState('running');
  useEffect(() => { run().then(value => { console.log('DATABASE_ACCESS_QA', JSON.stringify(value)); setResult(JSON.stringify(value)); }).catch(error => { console.error('DATABASE_ACCESS_QA_FAILED', String(error)); setResult(String(error)); }); }, []);
  return <View style={{ padding: 32 }}><Text selectable>{result}</Text></View>;
}
registerRootComponent(DatabaseAccessQa);
