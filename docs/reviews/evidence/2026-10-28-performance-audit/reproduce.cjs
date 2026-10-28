// Run from any directory: node docs/reviews/evidence/2026-10-28-performance-audit/reproduce.cjs
// Controlled logic experiments, not Android latency or memory benchmarks.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {DatabaseSync} = require('node:sqlite');
const root = path.resolve(__dirname, '../../../..');
const mobileRequire = createRequire(path.join(root, 'mobile/package.json'));
const ts = mobileRequire('typescript');

function loader({mocks = {}, clock = Date} = {}) {
  const cache = new Map();
  function load(relative) {
    const file = path.isAbsolute(relative) ? relative : path.join(root, 'mobile', relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = {exports: {}};
    cache.set(file, module);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText;
    vm.runInNewContext(js, {
      module, exports: module.exports, Date: clock, Map, Set, Promise, Math, URL,
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'));
        return mobileRequire(name);
      },
    }, {filename: file});
    return module.exports;
  }
  return load;
}

async function scheduling() {
  const results = [];
  for (const recoveryMs of [100, 2100]) {
    let time = 100000, claims = 0, recoveries = 0;
    const load = loader({clock: {now: () => time}});
    const {createExecutorTick} = load('src/workflows/executor/tick.ts');
    const {createExecutorCycle} = load('src/workflows/executor/cycle.ts');
    const operations = {
      listDueSnapshot: async () => [{id: 'new-image:submit', kind: 'SUBMIT'}],
      pendingSummary: async () => ({remainingDue: 1, remainingScheduled: 0}),
      claimById: async () => { claims++; return {id: 'new-image:submit', kind: 'SUBMIT'}; },
      get: async () => ({state: 'SUCCEEDED'}),
    };
    const tick = createExecutorTick({operations, executor: {
      recover: async () => {recoveries++; time += recoveryMs;}, handle: async () => {},
    }, owner: () => 'audit', isReadonly: () => false});
    const cycle = createExecutorCycle({runTick: opts => tick.run(opts), now: () => time});
    const rounds = [];
    for (let i = 0; i < 3; i++) {
      const r = await cycle.run({reason: 'foreground', maxPasses: 1});
      rounds.push({claimed: r.claimed, remainingDue: r.remainingDue});
    }
    assert.equal(claims, recoveryMs === 100 ? 3 : 0);
    results.push({recoveryMs, recoveries, claims, rounds});
  }
  return results;
}

async function agentAmplification() {
  const counts = {versionReads: 0, parsedVersions: 0, databaseQueries: 0};
  const recipe = JSON.stringify({input: {prompt: 'synthetic prompt'}});
  const receipts = Array.from({length: 20}, (_, i) => ({
    id: 'receipt-' + i, run_id: 'run-' + i,
    result_json: JSON.stringify({value: {draftId: 'draft-' + i}}),
  }));
  const service = {
    draft: async id => {counts.databaseQueries++; return {id, state: 'SUBMITTED', project_id: 'p', provider_id: 'novelai', target_asset_id: 'shared-asset', job_id: id + '-job'};},
    versions: async () => {
      counts.versionReads++; counts.databaseQueries++;
      return Array.from({length: 300}, (_, i) => {
        counts.parsedVersions++;
        return {id: 'version-' + i, recipe: JSON.parse(recipe)};
      });
    },
  };
  const db = {
    getFirstAsync: async sql => {
      counts.databaseQueries++;
      return sql.includes('creative_agent_scopes') ? {project_id: 'p', revision: 1} : {status: 'SUCCEEDED'};
    },
    getAllAsync: async sql => {
      counts.databaseQueries++;
      return sql.includes('creative_command_receipts') ? receipts : [{version_id: 'version-0'}];
    },
  };
  const load = loader({mocks: {'./service': {createCreativeService: () => service}}});
  const cards = await load('src/creative/agentCreativeActivity.ts').readAgentCreativeActivity(db, 'thread');
  assert.equal(cards.length, 20);
  assert.equal(counts.versionReads, 20);
  assert.equal(counts.parsedVersions, 6000);
  return {fixture: {cards: 20, versionsOnSharedAsset: 300}, ...counts};
}

async function verifyAmplification() {
  const counts = {hashes: 0, resourceReads: 0, transactions: 0, sqlWrites: 0};
  const db = {
    getFirstAsync: async () => {
      counts.resourceReads++;
      return {id: 'resource', blob_sha256: 'hash', relative_path: 'image.png', state: 'AVAILABLE', revision: 0};
    },
    runAsync: async () => {counts.sqlWrites++; return {changes: 1};},
  };
  const load = loader({mocks: {
    '../storage/sqliteBusy': {withWriteTransaction: async (database, work) => {counts.transactions++; return work(database);}},
    '../ids': {createId: () => 'unused'},
  }});
  const resources = load('src/creative/fileResources.ts').createFileResources(db, {
    now: () => 100000, verify: async () => {counts.hashes++; return true;},
  });
  for (let i = 0; i < 300; i++) await resources.verify('version-' + i);
  assert.equal(counts.hashes, 300);
  assert.equal(counts.transactions, 300);
  assert.equal(counts.resourceReads, 600);
  return {fixture: '300 unchanged AVAILABLE resources; hash and transaction I/O mocked', ...counts};
}

function queryPlans() {
  const schema = loader()('src/storage/schema.ts');
  const db = new DatabaseSync(':memory:');
  // Reuse current production CREATE TABLE/INDEX definitions. No app DB is opened.
  const statements = schema.CURRENT_SCHEMA_STATEMENTS;
  for (const sql of statements) if (/^CREATE TABLE/i.test(sql)) db.exec(sql);
  const excludedIndexes = [];
  for (const sql of statements) if (/^CREATE (?:UNIQUE )?INDEX/i.test(sql)) {
    try {db.exec(sql);} catch (error) {excludedIndexes.push({sql, error: error.message});}
  }
  const queries = [
    {name: 'draft_by_job', sql: 'SELECT * FROM creative_generation_drafts WHERE job_id=?', params: ['job']},
    {name: 'decision_by_plan', sql: 'SELECT * FROM creative_decision_requests WHERE plan_id=?', params: ['plan']},
    {name: 'video_step_by_plan', sql: "SELECT * FROM creative_plan_steps WHERE plan_id=? AND kind='video'", params: ['plan']},
    {name: 'agent_receipts', sql: `SELECT r.id,o.run_id,r.result_json FROM creative_command_receipts r JOIN creative_execution_origins o ON o.id=r.execution_origin_id WHERE o.thread_id=? AND (r.command_name LIKE 'draft.%' OR r.command_name LIKE 'plan.%' OR r.command_name IN ('project.update','shot.update')) ORDER BY r.created_at DESC,r.rowid DESC LIMIT 100`, params: ['thread']},
    {name: 'version_number_lookup_control', sql: 'SELECT * FROM creative_asset_versions WHERE asset_id=? ORDER BY version_no DESC', params: ['asset']},
    {name: 'operation_due_control', sql: "SELECT * FROM workflow_operations WHERE kind=? AND state='PENDING' AND next_retry_at<=? AND (lease_expires_at IS NULL OR lease_expires_at<=?) ORDER BY next_retry_at,created_at,id LIMIT ?", params: ['SUBMIT', 100000, 100000, 8]},
  ];
  const plans = queries.map(q => ({name: q.name, sql: q.sql, details: db.prepare('EXPLAIN QUERY PLAN ' + q.sql).all(...q.params).map(row => row.detail)}));
  assert(plans.find(p => p.name === 'draft_by_job').details.some(d => d.includes('SCAN')));
  assert(plans.find(p => p.name === 'version_number_lookup_control').details.some(d => d.includes('INDEX')));
  db.close();
  return {schemaVersion: schema.APP_SCHEMA_VERSION, excludedIndexes, plans};
}

async function duplicateStorage() {
  const crypto = require('node:crypto');
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  const content = Buffer.from('identical external image bytes, synthetic fixture');
  const hash = digest(content), entries = new Map();
  let casHashReads = 0;
  const files = {
    makeDirectory: async () => {},
    stat: async p => entries.has(p) ? {exists: true, size: entries.get(p).length} : {exists: false},
    move: async (a, b) => {assert(entries.has(a)); entries.set(b, entries.get(a)); entries.delete(a);},
    copy: async (a, b) => {assert(entries.has(a)); entries.set(b, Buffer.from(entries.get(a)));},
    remove: async p => {entries.delete(p);},
  };
  const casModule = loader({mocks: {
    'expo-file-system/legacy': {documentDirectory: 'file:///audit/'}, '../native/media': {},
  }})('src/media/cas.ts');
  const cas = casModule.createArtifactCas(files, {documentDirectory: 'file:///audit/', sha256File: async uri => {
    casHashReads++; return digest(entries.get(new URL(uri).pathname.slice('/audit/'.length)));
  }});
  for (let i = 0; i < 2; i++) {
    const operationId = 'audit-import-' + i;
    const part = 'cas/parts/' + digest(operationId + '\0' + 0) + '.part';
    entries.set(part, content);
    const stage = await cas.adoptNativePart({partUri: 'file:///audit/' + part, mime: 'image/png', byteSize: content.length, sha256: hash}, {
      operationId, operationAttempt: 0, mime: 'image/png', maxBytes: 1024,
    });
    await stage.publish();
  }
  const casFileCount = [...entries.keys()].filter(p => p.startsWith('cas/sha256/')).length;
  const partCount = [...entries.keys()].filter(p => p.startsWith('cas/parts/')).length;
  assert.equal(casFileCount, 1); assert.equal(partCount, 0); assert.equal(casHashReads, 4);
  // Simulate a crash after publish but before artifact_blobs registration.
  const garbage = await casModule.collectGarbage({repository: {
    listUnreferenced: async () => [], removeBlobIfUnreferenced: async () => false, restoreBlob: async () => {},
  }, files, limit: 8});
  assert.equal(garbage.deleted, 0); assert.equal(entries.size, 1);

  const db = new DatabaseSync(':memory:');
  const schema = loader()('src/storage/schema.ts');
  for (const sql of schema.CURRENT_SCHEMA_STATEMENTS) if (/^CREATE TABLE/i.test(sql)) db.exec(sql);
  db.exec("INSERT INTO creative_execution_state VALUES(1,'epoch'); INSERT INTO creative_lineage VALUES(1,'namespace')");
  db.prepare('INSERT INTO artifact_blobs VALUES(?,?,?,?,?,?)').run(hash, content.length, 'image/png', 'cas/sha256/' + hash.slice(0, 2) + '/' + hash, 1, 1);
  const appDb = {
    getFirstAsync: async (sql, ...params) => db.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params),
    runAsync: async (sql, ...params) => db.prepare(sql).run(...params),
  };
  const mocks = {
    '../storage/sqliteBusy': {withWriteTransaction: async (database, work) => work(database)},
    '../ids': {}, '../workflows/executor/operationInsert': {}, './enqueueVersionExport': {},
    './novelAiMetadata': {}, './agentScope': {},
    './story': {storySchemas: {}}, './drafts': {draftSchemas: {}},
    './assetLifecycle': {lifecycleSchemas: {}}, './plans': {planSchemas: {}},
    './fileFormats': {CREATIVE_FILE_MIMES: []}, './authoredText': {authoredTextSchemas: {}},
    './changeReview': {reviewSchemas: {}},
  };
  let id = 0;
  const service = loader({mocks})('src/creative/service.ts').createCreativeService(appDb, {id: () => 'id-' + (++id), now: () => 1});
  const command = {name: 'asset.import', payload: {title: 'same image', kind: 'image', blobSha256: hash}};
  const a = await service.execute(command, 'import-1');
  const b = await service.execute(command, 'import-2');
  await service.execute(command, 'import-2'); // Same key must still be idempotent.
  assert.notEqual(a.value.assetId, b.value.assetId);
  const counts = {};
  for (const table of ['creative_assets', 'creative_asset_versions', 'creative_version_files', 'artifact_blobs']) counts[table] = db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
  assert.equal(counts.creative_assets, 2); assert.equal(counts.artifact_blobs, 1);
  db.close();

  const backupEntries = new Map([
    ['cas/sha256/aa/content', Buffer.from('shared original')],
    ['cas/parts/stale.part', Buffer.from('crash leftover')],
    ['posters/preview.jpg', Buffer.from('derived preview')],
    ['snapshot-source.db', Buffer.from('synthetic database snapshot')],
  ]);
  const sourcePaths = [...backupEntries.keys()].filter(p => p !== 'snapshot-source.db');
  const backupFiles = {
    list: async () => sourcePaths,
    size: async p => backupEntries.get(p)?.length,
    hash: async p => digest(backupEntries.get(p)),
    copy: async (a, b) => {backupEntries.set(b, Buffer.from(backupEntries.get(a)));},
    read: async p => {if (!backupEntries.has(p)) throw new Error('missing'); return backupEntries.get(p).toString();},
    write: async (p, text) => {backupEntries.set(p, Buffer.from(text));},
  };
  const {buildCreativeBackup} = loader()('src/storage/fileBackup.ts');
  for (const backupId of ['a'.repeat(32), 'b'.repeat(32)]) await buildCreativeBackup({
    id: backupId, root: 'file:///audit/', now: 1, files: backupFiles, snapshot: async () => 'snapshot-source.db',
  });
  const backupOriginalCopies = [...backupEntries.keys()].filter(p => p.startsWith('creative-backups/') && p.endsWith('/files/cas/sha256/aa/content')).length;
  const backupStalePartCopies = [...backupEntries.keys()].filter(p => p.startsWith('creative-backups/') && p.endsWith('/files/cas/parts/stale.part')).length;
  assert.equal(backupOriginalCopies, 2); assert.equal(backupStalePartCopies, 2);
  return {
    physicalCas: {imports: 2, casFileCount, partCount, casHashReads, initialImporterHashesExcluded: true},
    logicalImport: {commandsWithDistinctKeys: 2, replayedSameKey: 1, ...counts},
    crashGap: {publishedButNotRegisteredFiles: 1, databaseDrivenGcDeleted: garbage.deleted},
    backups: {backups: 2, sourcePaths, backupOriginalCopies, backupStalePartCopies},
  };
}

(async () => {
  const result = {
    evidenceType: 'controlled logic and query-plan experiments; no Android timings',
    node: process.version,
    scheduling: await scheduling(),
    agentAmplification: await agentAmplification(),
    verifyAmplification: await verifyAmplification(),
    sqlite: queryPlans(),
    duplicateStorage: await duplicateStorage(),
  };
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
})().catch(error => {console.error(error); process.exitCode = 1;});
