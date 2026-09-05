// Dedicated local QA entry; never imported by the app. Uses a fresh fixture DB.
import '../src/runtimeCompatibility';
import React, { useEffect, useState } from 'react';
import { registerRootComponent } from 'expo';
import { Text, View } from 'react-native';
import { openDatabaseSync } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { ensureAppDatabase } from '../src/storage/database';
import { withRetryingQueries, withWriteTransaction } from '../src/storage/sqliteBusy';
import { createJobStateRepository } from '../src/workflows/executor/jobStateRepository';
import { createTaskCommandService } from '../src/tasks/taskCommandService';
import { createTaskProjectionRepository } from '../src/tasks/projectionRepository';
import { repairStaleTaskStatuses } from '../src/tasks/taskProjectionRepair';

async function run() {
  const name = `refresh-contention-${Date.now()}.db`;
  const raw = openDatabaseSync(name, { useNewConnection: true });
  ensureAppDatabase(raw);
  const db = withRetryingQueries(raw);
  const writer = openDatabaseSync(name, { useNewConnection: true });
  const jobs = createJobStateRepository(db);
  let signals = 0;
  const commands = createTaskCommandService({ db, fileExists: async () => false, resolveCasUri: p => p, invalidate: () => {}, signal: () => { signals++; } });
  const result = { database: name, independentConnections: true, rounds: 0, signals: 0, taskStatuses: [], maxStallMs: 0 };
  let last = performance.now();
  const timer = setInterval(() => { const time = performance.now(); result.maxStallMs = Math.max(result.maxStallMs, time - last - 16); last = time; }, 16);
  try {
    for (let n = 0; n < 4; n++) {
      const id = `fixture-${n}`;
      await jobs.createWithEventAndOperation({ id, revision: 0, workflowId: 'fixture', workflowVersion: '1', workflowContentHash: 'h', adapterId: 'fixture', adapterVersion: '1', inputSnapshot: { prompt: 'fixture' }, status: 'RUNNING', createdAt: n, updatedAt: n },
        { id: `created-${n}`, type: 'FIXTURE', payload: {}, createdAt: n },
        { id: `operation-${n}`, kind: 'STATUS_SYNC', jobId: id, idempotencyKey: id, payload: {}, now: 0 });
    }
    for (let round = 0; round < 10; round++) {
      let entered;
      const ready = new Promise(resolve => { entered = resolve; });
      const held = writer.withExclusiveTransactionAsync(async txn => {
        await txn.runAsync('UPDATE executor_wake_state SET requested_at=requested_at+1 WHERE singleton=1');
        entered();
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      await ready;
      const work = Array.from({ length: 4 }, async (_, n) => {
        const job = await jobs.get(`fixture-${n}`);
        return jobs.transition({ jobId: job.id, expectedRevision: job.revision, patch: { status: round % 2 ? 'SUCCEEDED' : 'RUNNING', updatedAt: round + 100 },
          event: { id: `round-${round}-${n}`, type: 'STATUS_RECONCILED', payload: {}, createdAt: round + 100 } });
      });
      await Promise.all([held, ...work, ...Array.from({ length: 3 }, () => commands.requestRefresh({ maintenance: 'force-next-slice' })),
        createTaskProjectionRepository(db).readWindow(40)]);
      result.rounds++;
    }
    // Exercise the real rollback of a stale read snapshot after another writer commits.
    let first = true;
    let attempts = 0;
    await withWriteTransaction(db, async txn => {
      attempts++;
      await txn.getFirstAsync('SELECT generation FROM executor_wake_state');
      if (first) {
        first = false;
        // Separate readers/writers use the installed default DELETE journal.
        // A competing write reserves the lock; releasing it forces a retry.
        let release;
        const done = new Promise(resolve => { release = resolve; });
        await writer.execAsync('BEGIN IMMEDIATE');
        setTimeout(() => { writer.execAsync('ROLLBACK').finally(release); }, 50);
        try { await txn.runAsync('UPDATE executor_wake_state SET requested_at=requested_at+1'); }
        finally { await done; }
      } else await txn.runAsync('UPDATE executor_wake_state SET requested_at=requested_at+1');
    });
    result.transactionAttempts = attempts;
    await db.runAsync("UPDATE tasks SET status='RUNNING' WHERE id='fixture-0'");
    result.repair = await repairStaleTaskStatuses(db);
    result.taskStatuses = await db.getAllAsync('SELECT t.status AS task,j.status AS job FROM tasks t JOIN workflow_jobs j ON j.id=t.id ORDER BY t.id');
    result.signals = signals;
    result.wake = await db.getFirstAsync('SELECT generation FROM executor_wake_state');
    if (signals !== 30 || result.wake.generation !== 30 || result.taskStatuses.some(row => row.task !== 'SUCCESS' || row.job !== 'SUCCEEDED')) throw new Error('persisted outcomes differ');
    result.ok = true;
    return result;
  } finally {
    clearInterval(timer);
    await writer.closeAsync(); await raw.closeAsync();
  }
}

function App() {
  const [text, setText] = useState('Running SQLite contention regression…');
  useEffect(() => { run().then(async result => {
    await FileSystem.writeAsStringAsync(`${FileSystem.documentDirectory}refresh-contention-result.json`, JSON.stringify(result, null, 2));
    setText(JSON.stringify(result));
  }).catch(async error => {
    const result = { ok: false, error: String(error.stack ?? error) };
    await FileSystem.writeAsStringAsync(`${FileSystem.documentDirectory}refresh-contention-result.json`, JSON.stringify(result, null, 2));
    setText(result.error);
  }); }, []);
  return <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}><Text>{text}</Text></View>;
}
registerRootComponent(App);
