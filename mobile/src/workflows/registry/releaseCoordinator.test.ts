import { createRealSqliteTestDb } from '../../test/realSqlite';
import { runAppMigrations } from '../../storage/migrations/runner';
import h3V100 from '../definitions/autodl/minimax-h3-i2v-15s.json';
import h3V101Package from '../definitions/autodl/minimax-h3-i2v-15s-v1.0.1.package.json';
import { canonicalizeDefinition } from './canonicalize';
import { createWorkflowRegistry } from './repository';
import { builtinWorkflowReleases } from './builtin';
import { createWorkflowReleaseCoordinator } from './releaseCoordinator';
import { RegistryReleaseError, type BuiltinWorkflowReleaseSet } from './releaseManifest';
import {
  LEGACY_DEFINITION_IDENTITY_V1,
  WORKFLOW_PACKAGE_IDENTITY_V1,
  computeWorkflowDigest,
} from './identity';

const LEGACY_HASH = '917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390';
const V101_HASH = 'fe166625b82f953d23eac160ed509f468b2383b7d7c8be6383abca9096381897';
const RELEASE_MANIFEST_HASH = '93a5882eda1013a0232588ec824d817b8dd63f6317f4ecd08c9c09206b6305c5';

function createHistoricalV7Fixture() {
  const db = createRealSqliteTestDb();
  runAppMigrations(db as never);
  db.runSync(
    'INSERT INTO workflow_registry (workflow_id,version,content_hash,hash_scheme,source,trust,definition_json,installed_at) VALUES (?,?,?,?,?,?,?,?)',
    h3V100.id, h3V100.version, LEGACY_HASH, LEGACY_DEFINITION_IDENTITY_V1,
    'builtin', 'builtin', canonicalizeDefinition(h3V100), 1,
  );
  db.runSync(
    'INSERT INTO workflow_registry_active (workflow_id,version,content_hash) VALUES (?,?,?)',
    h3V100.id, h3V100.version, LEGACY_HASH,
  );
  db.runSync(
    'INSERT INTO tasks (id,prompt,status,resolution,duration,created_at,updated_at,workflow_id,workflow_version,workflow_hash) VALUES (?,?,?,?,?,?,?,?,?,?)',
    'task-old', 'keep me', 'SUCCEEDED', '768p竖', 5, 1, 1,
    h3V100.id, h3V100.version, LEGACY_HASH,
  );
  return db;
}

function coordinatorFor(db: ReturnType<typeof createRealSqliteTestDb>, backup = jest.fn(() => 'release.backup.db')) {
  return {
    backup,
    coordinator: createWorkflowReleaseCoordinator({
      registry: createWorkflowRegistry(db as never),
      backup,
      now: () => 20,
      isCompatible: () => true,
    }),
  };
}

test('accepts historical v1.0.0, preserves provenance, and activates v1.0.1', async () => {
  const db = createHistoricalV7Fixture();
  const beforeRegistry = db.getFirstSync<any>("SELECT * FROM workflow_registry WHERE version='1.0.0'");
  const beforeTask = db.getFirstSync<any>("SELECT * FROM tasks WHERE id='task-old'");
  const { coordinator, backup } = coordinatorFor(db);
  try {
    const result = await coordinator.reconcile(builtinWorkflowReleases);
    expect(result).toMatchObject({
      status: 'updated',
      installed: [{ workflowId: h3V100.id, version: '1.0.1' }],
      acceptedHistorical: [{ workflowId: h3V100.id, version: '1.0.0' }],
      activated: [{ workflowId: h3V100.id, version: '1.0.1', previousVersion: '1.0.0' }],
      backupName: 'release.backup.db',
    });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(db.getFirstSync<any>("SELECT * FROM workflow_registry WHERE version='1.0.0'")).toEqual(beforeRegistry);
    expect(db.getFirstSync<any>("SELECT * FROM tasks WHERE id='task-old'")).toEqual(beforeTask);
    expect(db.getFirstSync<any>("SELECT version,content_hash,previous_version,previous_hash FROM workflow_registry_active WHERE workflow_id=?", h3V100.id)).toEqual({
      version: '1.0.1', content_hash: V101_HASH, previous_version: '1.0.0', previous_hash: LEGACY_HASH,
    });
  } finally {
    db.close();
  }
});

test('is a no-op on the second run and does not create another backup', async () => {
  const db = createHistoricalV7Fixture();
  const { coordinator, backup } = coordinatorFor(db);
  try {
    await coordinator.reconcile(builtinWorkflowReleases);
    backup.mockClear();
    await expect(coordinator.reconcile(builtinWorkflowReleases)).resolves.toEqual({ status: 'unchanged' });
    expect(backup).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test('backs up before recording a release whose content and activation are already reconciled', async () => {
  const db = createHistoricalV7Fixture();
  const initial = coordinatorFor(db);
  try {
    await initial.coordinator.reconcile(builtinWorkflowReleases);
    db.runSync('DELETE FROM workflow_registry_releases WHERE release_id=?', builtinWorkflowReleases.releaseId);
    const { coordinator, backup } = coordinatorFor(db);

    await expect(coordinator.reconcile(builtinWorkflowReleases)).resolves.toMatchObject({
      status: 'updated',
      installed: [],
      activated: [],
      backupName: 'release.backup.db',
    });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(db.getFirstSync<{ manifest_hash: string }>(
      'SELECT manifest_hash FROM workflow_registry_releases WHERE release_id=?',
      builtinWorkflowReleases.releaseId,
    )).toEqual({ manifest_hash: RELEASE_MANIFEST_HASH });
  } finally {
    db.close();
  }
});

test('installs both pinned packages on a clean database', async () => {
  const db = createRealSqliteTestDb();
  runAppMigrations(db as never);
  const { coordinator } = coordinatorFor(db);
  try {
    const result = await coordinator.reconcile(builtinWorkflowReleases);
    expect(result.status).toBe('updated');
    expect(db.getAllSync<{ version: string }>('SELECT version FROM workflow_registry ORDER BY version'))
      .toEqual([{ version: '1.0.0' }, { version: '1.0.1' }]);
    expect(db.getFirstSync<{ version: string }>('SELECT version FROM workflow_registry_active WHERE workflow_id=?', h3V100.id))
      .toEqual({ version: '1.0.1' });
  } finally {
    db.close();
  }
});

test('upgrades directly from historical v1.0.0 to the highest declared v1.0.3 release', async () => {
  const db = createHistoricalV7Fixture();
  const v103Package = JSON.parse(JSON.stringify(h3V101Package));
  v103Package.metadata.version = '1.0.3';
  delete v103Package.metadata.contentHash;
  const v103Hash = computeWorkflowDigest(v103Package, WORKFLOW_PACKAGE_IDENTITY_V1);
  v103Package.metadata.contentHash = v103Hash;
  const skipReleaseSet: BuiltinWorkflowReleaseSet = {
    ...builtinWorkflowReleases,
    releaseId: 'mobile-skip-upgrade-test',
    releases: [
      ...builtinWorkflowReleases.releases,
      { package: v103Package, identity: { scheme: WORKFLOW_PACKAGE_IDENTITY_V1, digest: v103Hash } },
    ],
  };
  const { coordinator } = coordinatorFor(db);
  try {
    await coordinator.reconcile(skipReleaseSet);
    expect(db.getAllSync<{ version: string }>('SELECT version FROM workflow_registry ORDER BY version'))
      .toEqual([{ version: '1.0.0' }, { version: '1.0.1' }, { version: '1.0.3' }]);
    expect(db.getFirstSync<any>(
      'SELECT version,content_hash,previous_version,previous_hash FROM workflow_registry_active WHERE workflow_id=?',
      h3V100.id,
    )).toEqual({
      version: '1.0.3',
      content_hash: v103Hash,
      previous_version: '1.0.0',
      previous_hash: LEGACY_HASH,
    });
  } finally {
    db.close();
  }
});

test('rejects an undeclared same-version representation before backup or writes', async () => {
  const db = createHistoricalV7Fixture();
  const changed = { ...h3V100, metadata: { ...h3V100.metadata, title: 'tampered but internally consistent' } };
  const changedHash = computeWorkflowDigest(changed, LEGACY_DEFINITION_IDENTITY_V1);
  db.runSync(
    'UPDATE workflow_registry SET content_hash=?,definition_json=? WHERE workflow_id=? AND version=?',
    changedHash, canonicalizeDefinition(changed), h3V100.id, h3V100.version,
  );
  const before = db.getAllSync<any>('SELECT * FROM workflow_registry');
  const { coordinator, backup } = coordinatorFor(db);
  try {
    await expect(coordinator.reconcile(builtinWorkflowReleases)).rejects.toMatchObject({
      code: 'REGISTRY_IMMUTABLE_VERSION_CONFLICT',
    });
    expect(backup).not.toHaveBeenCalled();
    expect(db.getAllSync<any>('SELECT * FROM workflow_registry')).toEqual(before);
    expect(db.getAllSync<any>('SELECT * FROM workflow_registry_releases')).toEqual([]);
  } finally {
    db.close();
  }
});

test('rejects a reused release id with another digest', async () => {
  const db = createHistoricalV7Fixture();
  db.runSync('INSERT INTO workflow_registry_releases (release_id,manifest_hash,applied_at) VALUES (?,?,?)',
    builtinWorkflowReleases.releaseId, '0'.repeat(64), 1);
  const { coordinator, backup } = coordinatorFor(db);
  try {
    await expect(coordinator.reconcile(builtinWorkflowReleases)).rejects.toMatchObject({ code: 'REGISTRY_RELEASE_ID_REUSED' });
    expect(backup).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test('preserves an active local import while staging builtin packages', async () => {
  const db = createHistoricalV7Fixture();
  db.runSync(
    'INSERT INTO workflow_registry (workflow_id,version,content_hash,hash_scheme,source,trust,definition_json,installed_at) VALUES (?,?,?,?,?,?,?,?)',
    h3V100.id, '9.0.0', V101_HASH, WORKFLOW_PACKAGE_IDENTITY_V1,
    'local-import', 'untrusted-local', canonicalizeDefinition(h3V101Package), 2,
  );
  db.runSync(
    'UPDATE workflow_registry_active SET version=?,content_hash=? WHERE workflow_id=?',
    '9.0.0', V101_HASH, h3V100.id,
  );
  const { coordinator } = coordinatorFor(db);
  try {
    await coordinator.reconcile(builtinWorkflowReleases);
    expect(db.getFirstSync<any>('SELECT version,content_hash FROM workflow_registry_active WHERE workflow_id=?', h3V100.id))
      .toEqual({ version: '9.0.0', content_hash: V101_HASH });
  } finally {
    db.close();
  }
});

test('uses the persisted historical hash when a downgrade selects v1.0.0', async () => {
  const db = createHistoricalV7Fixture();
  db.runSync(
    'INSERT INTO workflow_registry (workflow_id,version,content_hash,hash_scheme,source,trust,definition_json,installed_at) VALUES (?,?,?,?,?,?,?,?)',
    h3V100.id, '1.0.1', V101_HASH, WORKFLOW_PACKAGE_IDENTITY_V1,
    'builtin', 'builtin', canonicalizeDefinition(h3V101Package), 2,
  );
  db.runSync('UPDATE workflow_registry_active SET version=?,content_hash=? WHERE workflow_id=?', '1.0.1', V101_HASH, h3V100.id);
  const downgradeSet: BuiltinWorkflowReleaseSet = {
    ...builtinWorkflowReleases,
    releaseId: 'mobile-downgrade-test',
    releases: [builtinWorkflowReleases.releases[0]],
  };
  const { coordinator } = coordinatorFor(db);
  try {
    await coordinator.reconcile(downgradeSet);
    expect(db.getFirstSync<any>('SELECT version,content_hash,previous_version FROM workflow_registry_active WHERE workflow_id=?', h3V100.id))
      .toEqual({ version: '1.0.0', content_hash: LEGACY_HASH, previous_version: '1.0.1' });
  } finally {
    db.close();
  }
});

test('does not write when the pre-release backup fails', async () => {
  const db = createHistoricalV7Fixture();
  const before = db.getAllSync<any>('SELECT * FROM workflow_registry');
  const { coordinator } = coordinatorFor(db, jest.fn(() => { throw new Error('disk full'); }));
  try {
    await expect(coordinator.reconcile(builtinWorkflowReleases)).rejects.toEqual(
      expect.objectContaining<Partial<RegistryReleaseError>>({ code: 'REGISTRY_RELEASE_BACKUP_FAILED' }),
    );
    expect(db.getAllSync<any>('SELECT * FROM workflow_registry')).toEqual(before);
    expect(db.getAllSync<any>('SELECT * FROM workflow_registry_releases')).toEqual([]);
  } finally {
    db.close();
  }
});
