// Dedicated benchmark entry. Select only through a local Gradle init script; never linked from app routes.
import '../src/runtimeCompatibility';
import React, { useEffect, useState } from 'react';
import { registerRootComponent } from 'expo';
import { Text, View } from 'react-native';
import { openDatabaseSync } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import CryptoJS from 'crypto-js';
import { ensureAppDatabase } from '../src/storage/database';
import { createTaskProjectionRepository } from '../src/tasks/projectionRepository';
import { createTaskListSession } from '../src/tasks/taskListSession';
import { createTaskProjectionEvents } from '../src/tasks/taskProjectionEvents';
import { sha256File, probeVideo } from '../src/native/media';
import { createArtifactCas } from '../src/media/cas';

const root = FileSystem.documentDirectory;
const video = `${root}task-refresh-128MiB.mp4`;
const measure = async work => { const start = performance.now(); const value = await work(); return { ms: performance.now() - start, value }; };
async function run() {
  const config = JSON.parse(await FileSystem.readAsStringAsync(`${root}task-refresh-benchmark-config.json`));
  const expected = config.videoSha256;
  const samples = { build: 'self-contained debug APK, Hermes bundle; not release acceptance', coldReadsMs: [], warmRevisionMs: [], phases: {}, maxEventLoopStallMs: 0, transfer: 'NOT RUN: no public HTTPS fixture endpoint' };
  let db = openDatabaseSync('task-refresh-v7.db');
  ensureAppDatabase(db);
  samples.counts = await db.getFirstAsync("SELECT COUNT(*) AS tasks,SUM(status='RUNNING') AS active,SUM(status='SUCCESS') AS terminal,(SELECT COUNT(*) FROM workflow_operations) AS pending FROM tasks");
  await db.closeAsync();
  for (let n = 0; n < 5; n++) {
    db = openDatabaseSync('task-refresh-v7.db', { useNewConnection: true });
    const read = await measure(() => createTaskProjectionRepository(db).readConsistentWindow(40));
    if (read.value.items?.length !== 40) throw new Error('fixture missing first page');
    samples.coldReadsMs.push(read.ms);
    await db.closeAsync();
  }
  db = openDatabaseSync('task-refresh-v7.db', { useNewConnection: true });
  const repository = createTaskProjectionRepository(db);
  for (let n = 0; n < 20; n++) samples.warmRevisionMs.push((await measure(() => repository.readRevision())).ms);
  let reconstructions = 0;
  const projections = createTaskProjectionEvents();
  const session = createTaskListSession({ projections, repository: { ...repository, readConsistentWindow: async (...args) => { reconstructions++; return repository.readConsistentWindow(...args); } } });
  session.setVisible(true);
  await new Promise(resolve => {
    const unsubscribe = session.subscribe(() => { if (!session.getSnapshot().read.pending) { unsubscribe(); resolve(); } });
    projections.invalidate();
  });
  const cards = session.getSnapshot().items;
  const readCount = reconstructions;
  await new Promise(resolve => {
    const unsubscribe = session.subscribe(() => { if (!session.getSnapshot().read.pending) { unsubscribe(); resolve(); } });
    projections.invalidate();
  });
  samples.unchangedCardsReused = session.getSnapshot().items.every((item, n) => item === cards[n]);
  samples.unchangedRevisionCardReads = reconstructions - readCount;
  session.dispose();
  let last = performance.now();
  const stalls = [];
  const timer = setInterval(() => { const now = performance.now(); stalls.push(Math.max(0, now - last - 16)); last = now; }, 16);
  try {
    for (const label of ['nativeHash1', 'nativeHash2']) {
      const result = await measure(() => sha256File(video));
      if (result.value !== expected) throw new Error('fixture hash mismatch');
      samples.phases[label] = result.ms;
    }
    const probe = await measure(() => probeVideo(video));
    samples.phases.probe = probe.ms;
    samples.videoProbe = probe.value;
    const operationId = 'benchmark-native-part';
    const key = CryptoJS.SHA256(`${operationId}\u00001`).toString(CryptoJS.enc.Hex);
    const partUri = `${root}cas/parts/${key}.part`;
    await FileSystem.makeDirectoryAsync(`${root}cas/parts`, { intermediates: true });
    await FileSystem.copyAsync({ from: video, to: partUri });
    const publication = await measure(async () => {
      const staged = await createArtifactCas().adoptNativePart({ partUri, mime: 'video/mp4', byteSize: 134217728, sha256: expected }, { operationId, operationAttempt: 1, mime: 'video/mp4', maxBytes: 134217728 });
      return staged.publish();
    });
    samples.phases.casAdoptionAndPublication = publication.ms;
    samples.published = publication.value;
    await new Promise(resolve => setTimeout(resolve, 50));
  } finally { clearInterval(timer); }
  samples.eventLoopStallsMs = stalls;
  samples.maxEventLoopStallMs = Math.max(0, ...stalls);
  samples.firstPageP95Ms = [...samples.coldReadsMs].sort((a, b) => a - b)[4];
  await db.closeAsync();
  await FileSystem.writeAsStringAsync(`${root}task-refresh-benchmark-results.json`, JSON.stringify(samples, null, 2));
  return samples;
}

function Benchmark() {
  const [status, setStatus] = useState('Running task refresh benchmark…');
  useEffect(() => { run().then(result => setStatus(JSON.stringify(result.phases))).catch(async error => {
    setStatus(String(error)); await FileSystem.writeAsStringAsync(`${root}task-refresh-benchmark-error.txt`, String(error.stack ?? error));
  }); }, []);
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}><Text>{status}</Text></View>;
}
registerRootComponent(Benchmark);
