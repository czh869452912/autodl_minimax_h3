# Workflow Release Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade historical Workflow Registry rows without clearing application data, install and activate pinned builtin releases safely, and make future `1.0.2+` releases append-only Manifest changes.

**Architecture:** Add one schema v7 migration that records each Registry row's identity scheme and creates an applied-Manifest ledger. Introduce immutable package-backed builtin releases and a release coordinator that preflights exact historical representations, creates a verified backup, then installs missing versions and changes active pointers in one SQLite transaction. Catalog bootstrap delegates release work to this coordinator; normal future workflow versions do not change the database schema.

**Tech Stack:** TypeScript 6, React Native 0.86, Expo 57, Expo SQLite, Jest 29 with `node:sqlite`, CryptoJS SHA-256, Gradle/Android emulator.

**Execution roots:** Run every `npm` command from `D:\Claude-project\autodl_minimax_h3\mobile`, every `gradlew.bat` command from `D:\Claude-project\autodl_minimax_h3\mobile\android`, and every `git` command from `D:\Claude-project\autodl_minimax_h3` unless a step explicitly changes location.

---

## File structure

- Create `mobile/src/workflows/registry/identity.ts`: stable identity-scheme names, representation detection, and digest computation.
- Create `mobile/src/workflows/registry/identity.test.ts`: protocol golden vectors and rejection cases.
- Create `mobile/src/storage/migrations/v7RegistryRelease.ts`: strict v6-to-v7 identity backfill and ledger creation.
- Modify `mobile/src/storage/schema.ts`: schema version 7 and release-ledger DDL.
- Modify `mobile/src/storage/migrations/runner.ts`: register and apply v7.
- Modify `mobile/src/storage/migrations/runner.test.ts`: real SQLite historical fixtures, preservation, recovery, and idempotency.
- Create `mobile/src/workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.0.package.json`: pinned primary package for `1.0.0`.
- Create `mobile/src/workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.1.package.json`: pinned primary package for `1.0.1`.
- Create `mobile/src/workflows/definitions/autodl/release-manifest.json`: runtime- and CI-readable immutable release description.
- Create `mobile/src/workflows/definitions/autodl/release-history.json`: append-only `releaseId` to Manifest-digest ledger.
- Create `mobile/src/workflows/registry/releaseManifest.ts`: Manifest types, validation, digesting, and prepared Registry records.
- Create `mobile/src/workflows/registry/releaseManifest.test.ts`: pinned digest and Manifest validation tests.
- Modify `mobile/src/workflows/registry/builtin.ts`: declare the immutable builtin release set and exact historical `1.0.0` digest.
- Create `mobile/src/workflows/registry/releaseCoordinator.ts`: preflight, backup, atomic reconciliation, activation policy, and structured errors.
- Create `mobile/src/workflows/registry/releaseCoordinator.test.ts`: real SQLite upgrade, skip-version, tamper, rollback, and downgrade tests.
- Modify `mobile/src/workflows/registry/types.ts`: batch reconciliation and release-ledger store contracts.
- Modify `mobile/src/workflows/registry/repository.ts`: one atomic batch write implementation for SQLite and memory stores.
- Modify `mobile/src/workflows/registry/repository.test.ts`: transaction and pointer-preservation tests.
- Modify `mobile/src/workflows/registry/service.ts`: expose one pure compatibility predicate for service and release selection.
- Modify `mobile/src/workflows/registry/service.test.ts`: shared compatibility behavior.
- Modify `mobile/src/storage/backup.ts`: release-labelled full database backups.
- Modify `mobile/src/storage/backup.test.ts`: safe name, close, restore integrity, and failure behavior.
- Modify `mobile/src/storage/DatabaseRecoveryScreen.tsx`: offer verified full-database restore in read-only mode.
- Modify `mobile/src/storage/DatabaseRecoveryScreen.test.tsx`: restore confirmation, busy state, and error behavior.
- Modify `mobile/app/_layout.tsx`: provide backup discovery/restore and reload the app after success.
- Modify `mobile/src/workflows/registry/catalog.ts`: delegate bootstrap reconciliation.
- Modify `mobile/src/workflows/registry/catalog.test.ts`: coordinator integration and non-builtin active preservation.
- Modify `mobile/src/create/CreateForm.tsx`: localized release diagnostics and fallback to a still-valid active workflow.
- Modify `mobile/src/create/createForm.test.ts`: no raw Registry exception and preserved form usability.
- Create `mobile/scripts/verify-workflow-releases.mjs`: CI-independent package and Manifest verification.
- Modify `mobile/package.json` and `mobile/package-lock.json`: verification script and v1.4.10.
- Modify `mobile/app.json`: v1.4.10.
- Modify `mobile/android/app/build.gradle`: versionName 1.4.10 and versionCode 20.
- Modify `.github/workflows/release.yml`: run Manifest verification before Android packaging.

### Task 1: Freeze workflow identity protocols

**Files:**
- Create: `mobile/src/workflows/registry/identity.ts`
- Create: `mobile/src/workflows/registry/identity.test.ts`
- Reference: `mobile/src/workflows/registry/canonicalize.ts`
- Reference: `mobile/src/workflows/schema/package.ts`

- [ ] **Step 1: Write golden-vector tests for both released identity schemes**

Create tests that load the two existing workflow definitions and assert the exact values already observed in production:

```ts
import h3V100 from '../definitions/autodl/minimax-h3-i2v-15s.json';
import h3V101 from '../definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json';
import { legacyDefinitionToPackage } from '../schema/package';
import {
  LEGACY_DEFINITION_IDENTITY_V1,
  WORKFLOW_PACKAGE_IDENTITY_V1,
  computeWorkflowDigest,
  detectWorkflowRepresentation,
} from './identity';

test('keeps released H3 identity protocols stable', () => {
  expect(computeWorkflowDigest(h3V100, LEGACY_DEFINITION_IDENTITY_V1)).toBe(
    '917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390',
  );
  expect(computeWorkflowDigest(legacyDefinitionToPackage(h3V100 as never), WORKFLOW_PACKAGE_IDENTITY_V1)).toBe(
    'b3d2ac04b13f581527a580d49abea9d9cc079ee8c8a6681232cd2cdbfda8ce81',
  );
  expect(computeWorkflowDigest(legacyDefinitionToPackage(h3V101 as never), WORKFLOW_PACKAGE_IDENTITY_V1)).toBe(
    'fe166625b82f953d23eac160ed509f468b2383b7d7c8be6383abca9096381897',
  );
});

test('detects only validated legacy definition and package envelopes', () => {
  expect(detectWorkflowRepresentation(h3V100)).toEqual({
    format: 'legacy-workflow-definition@1',
    scheme: LEGACY_DEFINITION_IDENTITY_V1,
  });
  expect(detectWorkflowRepresentation(legacyDefinitionToPackage(h3V100 as never))).toEqual({
    format: 'workflow-package@1',
    scheme: WORKFLOW_PACKAGE_IDENTITY_V1,
  });
  expect(() => detectWorkflowRepresentation({ id: 'partial' })).toThrow('REGISTRY_IDENTITY_FORMAT_UNKNOWN');
});
```

- [ ] **Step 2: Run the identity test and verify RED**

Run:

```powershell
npm test -- --runInBand src/workflows/registry/identity.test.ts
```

Expected: FAIL because `identity.ts` and its exports do not exist.

- [ ] **Step 3: Implement the two immutable identity protocols**

Use named string constants and synchronous CryptoJS hashing so schema migrations can validate rows inside a synchronous SQLite transaction:

```ts
import SHA256 from 'crypto-js/sha256';
import encHex from 'crypto-js/enc-hex';
import { canonicalizeDefinition } from './canonicalize';
import { parseWorkflowPackage } from '../schema/package';

export const LEGACY_DEFINITION_IDENTITY_V1 = 'workflow-definition/sorted-json@1' as const;
export const WORKFLOW_PACKAGE_IDENTITY_V1 = 'workflow-package/without-declared-hash+sorted-json@1' as const;
export type WorkflowIdentityScheme =
  | typeof LEGACY_DEFINITION_IDENTITY_V1
  | typeof WORKFLOW_PACKAGE_IDENTITY_V1;

export type WorkflowRepresentation = {
  format: 'legacy-workflow-definition@1' | 'workflow-package@1';
  scheme: WorkflowIdentityScheme;
};

function cloneWithoutDeclaredHash(value: unknown): unknown {
  const pkg = parseWorkflowPackage(value);
  const { contentHash: _contentHash, ...metadata } = pkg.metadata;
  return JSON.parse(JSON.stringify({ ...pkg, metadata }));
}

function assertLegacyDefinition(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('REGISTRY_IDENTITY_FORMAT_UNKNOWN');
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== '1.0' || typeof row.id !== 'string' || typeof row.version !== 'string' || row.kind !== 'atomic') {
    throw new Error('REGISTRY_IDENTITY_FORMAT_UNKNOWN');
  }
  for (const key of ['platform', 'metadata', 'inputs', 'request', 'outputs']) {
    if (!row[key] || typeof row[key] !== 'object') throw new Error('REGISTRY_IDENTITY_FORMAT_UNKNOWN');
  }
}

export function detectWorkflowRepresentation(value: unknown): WorkflowRepresentation {
  if (value && typeof value === 'object' && !Array.isArray(value) && (value as { apiVersion?: unknown }).apiVersion === 'workflow.autodl/v1') {
    parseWorkflowPackage(value);
    return { format: 'workflow-package@1', scheme: WORKFLOW_PACKAGE_IDENTITY_V1 };
  }
  assertLegacyDefinition(value);
  return { format: 'legacy-workflow-definition@1', scheme: LEGACY_DEFINITION_IDENTITY_V1 };
}

export function computeWorkflowDigest(value: unknown, scheme: WorkflowIdentityScheme): string {
  const projected = scheme === WORKFLOW_PACKAGE_IDENTITY_V1 ? cloneWithoutDeclaredHash(value) : value;
  if (scheme === LEGACY_DEFINITION_IDENTITY_V1) assertLegacyDefinition(projected);
  return SHA256(canonicalizeDefinition(JSON.parse(JSON.stringify(projected)))).toString(encHex);
}
```

- [ ] **Step 4: Run the identity tests and verify GREEN**

Run the same Jest command. Expected: 2 tests PASS with the exact three digests.

- [ ] **Step 5: Commit the identity protocol**

```powershell
git add mobile/src/workflows/registry/identity.ts mobile/src/workflows/registry/identity.test.ts
git commit -m "feat: freeze workflow identity protocols"
```

### Task 2: Add the schema v7 identity migration

**Files:**
- Create: `mobile/src/storage/migrations/v7RegistryRelease.ts`
- Modify: `mobile/src/storage/schema.ts`
- Modify: `mobile/src/storage/migrations/runner.ts`
- Modify: `mobile/src/storage/migrations/runner.test.ts`
- Modify: `mobile/src/storage/database.test.ts`
- Test: `mobile/src/storage/migrations/runner.test.ts`

- [ ] **Step 1: Add a real SQLite regression fixture matching the affected emulator**

Build a v6 fixture with the exact historical row and references:

```ts
const H3_V100_LEGACY_HASH = '917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390';

function createHistoricalV6Fixture() {
  const db = createRealSqliteTestDb();
  for (const statement of V5_SCHEMA_STATEMENTS) db.execSync(statement);
  v6DurableExecutor.apply({
    db: db as never,
    exec: (sql) => db.execSync(sql),
    hasColumn: (table, column) => db.getAllSync<{ name: string }>(`PRAGMA table_info("${table}")`)
      .some((row) => row.name === column),
  });
  db.execSync('PRAGMA user_version = 6');
  db.runSync(
    'INSERT INTO workflow_registry (workflow_id,version,content_hash,source,trust,definition_json,installed_at) VALUES (?,?,?,?,?,?,?)',
    'autodl.minimax-h3.i2v-15s', '1.0.0', H3_V100_LEGACY_HASH,
    'builtin', 'builtin', canonicalizeDefinition(h3V100), 1,
  );
  db.runSync(
    'INSERT INTO workflow_registry_active (workflow_id,version,content_hash) VALUES (?,?,?)',
    'autodl.minimax-h3.i2v-15s', '1.0.0', H3_V100_LEGACY_HASH,
  );
  db.runSync(
    'INSERT INTO tasks (id,prompt,status,resolution,duration,created_at,updated_at,workflow_id,workflow_version,workflow_hash) VALUES (?,?,?,?,?,?,?,?,?,?)',
    'task-old', 'keep me', 'SUCCEEDED', '768p竖', 5, 1, 1,
    'autodl.minimax-h3.i2v-15s', '1.0.0', H3_V100_LEGACY_HASH,
  );
  return db;
}

test('migrates historical workflow identities to v7 without rewriting provenance', () => {
  const db = createHistoricalV6Fixture();
  const before = db.getFirstSync('SELECT * FROM workflow_registry WHERE version = ?', '1.0.0');
  const result = runAppMigrations(db as never, { backup: jest.fn(), now: () => 10 });
  const after = db.getFirstSync<any>('SELECT * FROM workflow_registry WHERE version = ?', '1.0.0');
  expect(result).toEqual({ mode: 'writable', fromVersion: 6, toVersion: 7, migrated: true });
  expect(after).toMatchObject({ ...before, hash_scheme: LEGACY_DEFINITION_IDENTITY_V1 });
  expect(db.getFirstSync<any>("SELECT workflow_hash FROM tasks WHERE id='task-old'").workflow_hash).toBe(H3_V100_LEGACY_HASH);
});
```

Also add tests for package-row backfill, an unknown representation, a bad stored digest, repeated v7 startup, and preservation of active/previous/job/artifact hashes.

Update existing runner assertions exactly: fresh v0 ends at v7, the idempotent case starts/ends at v7, the future-schema fixture uses `PRAGMA user_version = 8`, and the ordered-step test asserts v5 DDL before v6 durable-executor DDL before the v7 ledger/identity update.

- [ ] **Step 2: Run the migration tests and verify RED**

```powershell
npm test -- --runInBand src/storage/migrations/runner.test.ts src/storage/database.test.ts
```

Expected: FAIL because `APP_SCHEMA_VERSION` is 6 and `hash_scheme`/ledger do not exist.

- [ ] **Step 3: Implement v7 DDL and strict backfill**

Set `APP_SCHEMA_VERSION = 7`, add the ledger statement, and register `v7RegistryRelease` after v6:

```ts
export const V7_SCHEMA_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS workflow_registry_releases (release_id TEXT PRIMARY KEY NOT NULL, manifest_hash TEXT NOT NULL, applied_at INTEGER NOT NULL)',
] as const;
```

```ts
export const v7RegistryRelease: MigrationStep = {
  fromVersion: 6,
  toVersion: 7,
  name: 'v7-registry-release-identities',
  apply({ db, exec, hasColumn }) {
    if (!hasColumn('workflow_registry', 'hash_scheme')) {
      exec('ALTER TABLE workflow_registry ADD COLUMN hash_scheme TEXT');
    }
    for (const statement of V7_SCHEMA_STATEMENTS) exec(statement);
    const rows = db.getAllSync<{
      workflow_id: string;
      version: string;
      content_hash: string;
      definition_json: string;
      hash_scheme?: string;
    }>('SELECT workflow_id,version,content_hash,definition_json,hash_scheme FROM workflow_registry');
    for (const row of rows) {
      const value: unknown = JSON.parse(row.definition_json);
      const representation = detectWorkflowRepresentation(value);
      if (computeWorkflowDigest(value, representation.scheme) !== row.content_hash) {
        throw new Error('REGISTRY_IDENTITY_DIGEST_MISMATCH');
      }
      if (row.hash_scheme && row.hash_scheme !== representation.scheme) {
        throw new Error('REGISTRY_IDENTITY_SCHEME_MISMATCH');
      }
      db.runSync(
        'UPDATE workflow_registry SET hash_scheme = ? WHERE workflow_id = ? AND version = ?',
        representation.scheme, row.workflow_id, row.version,
      );
    }
  },
};
```

Update `applyCurrentSchema` to invoke v7 after v6 so a fresh database receives the column and ledger before `PRAGMA user_version = 7`.

- [ ] **Step 4: Update pre-v7 fixtures to contain valid Registry payloads and digests**

Replace the currently invalid Registry JSON/hash pairs in migration tests with either the exact H3 legacy fixture or a minimal valid legacy definition whose digest is produced by `computeWorkflowDigest`. Do not weaken v7 validation to accept `{}` or arbitrary hashes.

- [ ] **Step 5: Run storage tests and verify GREEN**

Run the Step 2 command. Expected: all storage migration/database tests PASS, including v4→v5→v6→v7 ordering and v6→v7 recovery behavior.

- [ ] **Step 6: Commit schema v7**

```powershell
git add mobile/src/storage/schema.ts mobile/src/storage/migrations/runner.ts mobile/src/storage/migrations/v7RegistryRelease.ts mobile/src/storage/migrations/runner.test.ts mobile/src/storage/database.test.ts
git commit -m "feat: migrate registry identities to schema v7"
```

### Task 3: Pin builtin packages and validate the Release Manifest

**Files:**
- Create: `mobile/src/workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.0.package.json`
- Create: `mobile/src/workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.1.package.json`
- Create: `mobile/src/workflows/definitions/autodl/release-manifest.json`
- Create: `mobile/src/workflows/definitions/autodl/release-history.json`
- Create: `mobile/src/workflows/registry/releaseManifest.ts`
- Create: `mobile/src/workflows/registry/releaseManifest.test.ts`
- Modify: `mobile/src/workflows/registry/builtin.ts`
- Test: `mobile/src/workflows/registry/releaseManifest.test.ts`

- [ ] **Step 1: Write failing Manifest tests**

```ts
import { builtinWorkflowReleases } from './builtin';
import { prepareBuiltinReleaseSet, RegistryReleaseError } from './releaseManifest';
import releaseHistory from '../definitions/autodl/release-history.json';

const cloneReleaseSet = (): any => JSON.parse(JSON.stringify(builtinWorkflowReleases));

function duplicateCoordinateManifest() {
  const manifest = cloneReleaseSet();
  manifest.releases.push(JSON.parse(JSON.stringify(manifest.releases[0])));
  return manifest;
}

function wrongDigestManifest() {
  const manifest = cloneReleaseSet();
  manifest.releases[0].identity.digest = '0'.repeat(64);
  return manifest;
}

function unknownSchemeManifest() {
  const manifest = cloneReleaseSet();
  manifest.releases[0].identity.scheme = 'workflow-package/unknown@9';
  return manifest;
}

test('pins immutable H3 package identities and the historical v1.0.0 representation', async () => {
  const prepared = await prepareBuiltinReleaseSet(builtinWorkflowReleases);
  expect(prepared.releases.map((item) => [item.record.version, item.record.contentHash])).toEqual([
    ['1.0.0', 'b3d2ac04b13f581527a580d49abea9d9cc079ee8c8a6681232cd2cdbfda8ce81'],
    ['1.0.1', 'fe166625b82f953d23eac160ed509f468b2383b7d7c8be6383abca9096381897'],
  ]);
  expect(prepared.releases[0].acceptedHistorical).toContainEqual({
    workflowId: 'autodl.minimax-h3.i2v-15s',
    version: '1.0.0',
    format: 'legacy-workflow-definition@1',
    identity: {
      scheme: 'workflow-definition/sorted-json@1',
      digest: '917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390',
    },
  });
  expect(prepared.manifestHash).toBe('93a5882eda1013a0232588ec824d817b8dd63f6317f4ecd08c9c09206b6305c5');
  expect(releaseHistory['mobile-1.4.10']).toBe(prepared.manifestHash);
});

test.each([
  ['duplicate coordinate', duplicateCoordinateManifest()],
  ['wrong declared digest', wrongDigestManifest()],
  ['unknown identity scheme', unknownSchemeManifest()],
])('rejects %s before database writes', async (_name, manifest) => {
  await expect(prepareBuiltinReleaseSet(manifest)).rejects.toBeInstanceOf(RegistryReleaseError);
});
```

- [ ] **Step 2: Run the Manifest test and verify RED**

```powershell
npm test -- --runInBand src/workflows/registry/releaseManifest.test.ts
```

Expected: FAIL because the Manifest module and pinned packages do not exist.

- [ ] **Step 3: Create exact package-backed releases**

Convert the existing two definitions once and check in the resulting `WorkflowPackage` JSON. The `1.0.0` file must contain exactly this semantic JSON (formatting and object-key order are irrelevant because identity uses canonical sorted JSON):

```json
{
  "apiVersion": "workflow.autodl/v1",
  "kind": "Workflow",
  "metadata": {
    "id": "autodl.minimax-h3.i2v-15s",
    "version": "1.0.0",
    "title": "MiniMax H3 Image/Audio to Video",
    "category": "video",
    "description": "MiniMax H3 视频生成",
    "channel": "stable",
    "contentHash": "b3d2ac04b13f581527a580d49abea9d9cc079ee8c8a6681232cd2cdbfda8ce81"
  },
  "spec": {
    "adapter": {
      "id": "autodl-comfyui",
      "version": "0.0.0",
      "operation": "workflow.submit",
      "workflowId": "minimax_h3_image_audio_to_video_v2_15s"
    },
    "inputSchema": {
      "type": "object",
      "required": ["prompt", "resolution", "duration"],
      "properties": {
        "prompt": { "type": "string", "title": "Prompt（视频描述）", "description": "描述你想生成的视频：主体、动作、场景、镜头运动、光影与音效…", "minLength": 1, "x-workflow.semantic": "prompt", "x-workflow.widget": "textarea" },
        "resolution": { "type": "string", "title": "分辨率（Resolution）", "enum": ["768p竖", "480p竖", "768p横", "480p横"], "default": "768p竖", "x-workflow.semantic": "enum", "x-workflow.widget": "segmented" },
        "duration": { "type": "integer", "title": "视频时长（Duration）", "minimum": 1, "maximum": 15, "default": 5, "x-workflow.semantic": "integer", "x-workflow.widget": "stepper" },
        "seed": { "type": "string", "title": "随机种子 Seed（可选）", "description": "如 123456（留空则随机）", "x-workflow.semantic": "seed", "x-workflow.widget": "seed" },
        "images": { "type": "array", "maxItems": 9, "items": { "type": "object" }, "x-workflow.semantic": "image[]", "x-workflow.widget": "asset-list" },
        "audios": { "type": "array", "maxItems": 3, "items": { "type": "object" }, "x-workflow.semantic": "audio[]", "x-workflow.widget": "asset-list" }
      }
    },
    "uiSchema": {
      "sections": [
        { "id": "prompt", "title": "提示词", "fields": ["/prompt"] },
        { "id": "generation", "title": "生成参数", "fields": ["/resolution", "/duration", "/seed"] },
        { "id": "references", "title": "参考素材", "fields": ["/images", "/audios"] }
      ]
    },
    "bindings": { "prompt": "/prompt", "resolution": "/resolution", "duration": "/duration", "seed": "/seed", "images": "/images", "audios": "/audios" },
    "outputs": { "artifacts": [{ "kind": "video", "from": "/result/video" }] }
  }
}
```

The `1.0.1` file must contain this complete document:

```json
{
  "apiVersion": "workflow.autodl/v1",
  "kind": "Workflow",
  "metadata": {
    "id": "autodl.minimax-h3.i2v-15s",
    "version": "1.0.1",
    "title": "MiniMax H3 Image/Audio to Video",
    "category": "video",
    "description": "MiniMax H3 视频生成",
    "channel": "stable",
    "contentHash": "fe166625b82f953d23eac160ed509f468b2383b7d7c8be6383abca9096381897"
  },
  "spec": {
    "adapter": {
      "id": "autodl-comfyui",
      "version": "0.0.0",
      "operation": "workflow.submit",
      "workflowId": "minimax_h3_image_audio_to_video_v2_15s"
    },
    "inputSchema": {
      "type": "object",
      "required": ["prompt", "resolution", "duration"],
      "properties": {
        "prompt": { "type": "string", "title": "Prompt（视频描述）", "description": "描述你想生成的视频：主体、动作、场景、镜头运动、光影与音效…", "minLength": 1, "maxLength": 10000, "x-workflow.semantic": "prompt", "x-workflow.widget": "textarea" },
        "resolution": { "type": "string", "title": "分辨率（Resolution）", "enum": ["768p竖", "480p竖", "768p横", "480p横"], "default": "768p竖", "x-workflow.semantic": "enum", "x-workflow.widget": "segmented" },
        "duration": { "type": "integer", "title": "视频时长（Duration）", "minimum": 1, "maximum": 15, "default": 5, "x-workflow.semantic": "integer", "x-workflow.widget": "stepper" },
        "seed": { "type": "integer", "title": "随机种子 Seed（可选）", "description": "1–999999999999999（留空则随机）", "minimum": 1, "maximum": 999999999999999, "x-workflow.semantic": "seed", "x-workflow.widget": "seed" },
        "images": { "type": "array", "maxItems": 9, "items": { "type": "object" }, "x-workflow.semantic": "image[]", "x-workflow.widget": "asset-list" },
        "audios": { "type": "array", "maxItems": 3, "items": { "type": "object" }, "x-workflow.semantic": "audio[]", "x-workflow.widget": "asset-list" }
      }
    },
    "uiSchema": {
      "sections": [
        { "id": "prompt", "title": "提示词", "fields": ["/prompt"] },
        { "id": "generation", "title": "生成参数", "fields": ["/resolution", "/duration", "/seed"] },
        { "id": "references", "title": "参考素材", "fields": ["/images", "/audios"] }
      ]
    },
    "bindings": { "prompt": "/prompt", "resolution": "/resolution", "duration": "/duration", "seed": "/seed", "images": "/images", "audios": "/audios" },
    "outputs": { "artifacts": [{ "kind": "video", "from": "/result/video" }] }
  }
}
```

Do not generate either package at application startup.

- [ ] **Step 4: Implement strict Manifest preparation**

`prepareBuiltinReleaseSet` must:

```ts
export type RegistryReleaseErrorCode =
  | 'REGISTRY_RELEASE_MANIFEST_INVALID'
  | 'REGISTRY_RELEASE_DUPLICATE_COORDINATE'
  | 'REGISTRY_RELEASE_DIGEST_MISMATCH'
  | 'REGISTRY_RELEASE_ID_REUSED'
  | 'REGISTRY_STORED_DIGEST_INVALID'
  | 'REGISTRY_IMMUTABLE_VERSION_CONFLICT'
  | 'REGISTRY_ACTIVE_POINTER_INVALID'
  | 'REGISTRY_RELEASE_TARGET_MISSING'
  | 'REGISTRY_RELEASE_BACKUP_FAILED'
  | 'REGISTRY_RELEASE_TRANSACTION_ROLLED_BACK'
  | 'REGISTRY_RELEASE_RECOVERY_REQUIRED';

export class RegistryReleaseError extends Error {
  readonly name = 'RegistryReleaseError';
  readonly cause?: unknown;
  constructor(public readonly code: RegistryReleaseErrorCode, options: { cause?: unknown } = {}) {
    super(code);
    this.cause = options.cause;
  }
}

export async function prepareBuiltinReleaseSet(set: BuiltinWorkflowReleaseSet): Promise<PreparedReleaseSet> {
  if (set.apiVersion !== 'autodl.workflow-release-set/v1') throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID');
  const coordinates = new Set<string>();
  const releases: PreparedBuiltinRelease[] = [];
  for (const release of set.releases) {
    const verified = await parseVerifiedWorkflowPackage(release.package, 'builtin');
    const coordinate = `${verified.definition.id}\u0000${verified.definition.version}`;
    if (coordinates.has(coordinate)) throw new RegistryReleaseError('REGISTRY_RELEASE_DUPLICATE_COORDINATE');
    coordinates.add(coordinate);
    if (release.identity.scheme !== WORKFLOW_PACKAGE_IDENTITY_V1 || release.identity.digest !== verified.packageHash) {
      throw new RegistryReleaseError('REGISTRY_RELEASE_DIGEST_MISMATCH');
    }
    releases.push({
      package: verified.pkg,
      definition: verified.definition,
      record: {
        workflowId: verified.definition.id,
        version: verified.definition.version,
        contentHash: verified.packageHash,
        hashScheme: release.identity.scheme,
        source: 'builtin',
        trust: 'builtin',
        definitionJson: canonicalizeDefinition(verified.pkg),
        installedAt: 0,
      },
      acceptedHistorical: validateHistoricalDeclarations(release, verified.definition),
    });
  }
  const coordinatesInOrder = releases.map(({ record }) => ({ workflowId: record.workflowId, version: record.version }));
  const sortedCoordinates = [...coordinatesInOrder].sort((left, right) =>
    left.workflowId.localeCompare(right.workflowId) || compareVersions(left.version, right.version),
  );
  if (coordinatesInOrder.some((item, index) =>
    item.workflowId !== sortedCoordinates[index].workflowId || item.version !== sortedCoordinates[index].version,
  )) throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID');
  const manifestHash = await sha256Hex(canonicalizeDefinition(normalizeReleaseSet(set)));
  return { releaseId: set.releaseId, manifestHash, releases, activation: set.activation };
}
```

Add `hashScheme` to `RegistryRecord`. Historical declarations accept only the two known identity-scheme constants and must match their containing release coordinate. Export `collectManifestLiveHashes(prepared)` as the union of all primary digests and accepted-historical digests; the repository cleanup test passes this set to `removeUnreferenced` and proves both representations remain live.

- [ ] **Step 5: Declare the v1.4.10 Manifest and adapt it to the runtime release set**

Create `release-manifest.json` with package filenames rather than duplicated payloads:

```json
{
  "apiVersion": "autodl.workflow-release-set/v1",
  "releaseId": "mobile-1.4.10",
  "releases": [
    {
      "packageFile": "minimax-h3-i2v-15s-v1.0.0.package.json",
      "identity": {
        "scheme": "workflow-package/without-declared-hash+sorted-json@1",
        "digest": "b3d2ac04b13f581527a580d49abea9d9cc079ee8c8a6681232cd2cdbfda8ce81"
      },
      "acceptedHistorical": [
        {
          "workflowId": "autodl.minimax-h3.i2v-15s",
          "version": "1.0.0",
          "format": "legacy-workflow-definition@1",
          "identity": {
            "scheme": "workflow-definition/sorted-json@1",
            "digest": "917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390"
          }
        }
      ]
    },
    {
      "packageFile": "minimax-h3-i2v-15s-v1.0.1.package.json",
      "identity": {
        "scheme": "workflow-package/without-declared-hash+sorted-json@1",
        "digest": "fe166625b82f953d23eac160ed509f468b2383b7d7c8be6383abca9096381897"
      }
    }
  ],
  "activation": {
    "select": "highest-compatible-declared-version",
    "replaceActiveSources": ["builtin"],
    "preserveUnlistedVersions": true
  }
}
```

In `builtin.ts`, statically import both packages and the descriptor, then construct the runtime set without filename-based dynamic imports:

```ts
const builtinPackagesByFile = {
  'minimax-h3-i2v-15s-v1.0.0.package.json': h3V100Package,
  'minimax-h3-i2v-15s-v1.0.1.package.json': h3V101Package,
} as const;

const descriptor = parseBuiltinReleaseDescriptor(releaseManifestJson, Object.keys(builtinPackagesByFile));
export const builtinWorkflowReleases: BuiltinWorkflowReleaseSet = {
  apiVersion: descriptor.apiVersion,
  releaseId: descriptor.releaseId,
  releases: descriptor.releases.map(({ packageFile, ...release }) => ({
    ...release,
    package: builtinPackagesByFile[packageFile],
  })),
  activation: descriptor.activation,
};
```

Define `parseBuiltinReleaseDescriptor<const T extends string>(value: unknown, knownPackageFiles: readonly T[]): BuiltinReleaseDescriptor<T>` so `packageFile` is narrowed to `T`. It rejects unknown or duplicate filenames and requires every statically imported package to appear exactly once. `normalizeReleaseSet` is exactly a JSON-safe clone of `{ apiVersion, releaseId, releases, activation }` after filenames have been replaced by the pinned package objects; its canonical digest is `93a5882eda1013a0232588ec824d817b8dd63f6317f4ecd08c9c09206b6305c5`. Create `release-history.json` with:

```json
{
  "mobile-1.4.10": "93a5882eda1013a0232588ec824d817b8dd63f6317f4ecd08c9c09206b6305c5"
}
```

The test asserts that this stored digest equals `prepared.manifestHash`; future releases append a new property and never edit an existing one.

- [ ] **Step 6: Run Manifest tests and verify GREEN**

Run the Step 2 command. Expected: all Manifest tests PASS and both primary package digests match the spec.

- [ ] **Step 7: Commit pinned releases**

```powershell
git add mobile/src/workflows/definitions/autodl/*.package.json mobile/src/workflows/definitions/autodl/release-manifest.json mobile/src/workflows/definitions/autodl/release-history.json mobile/src/workflows/registry/releaseManifest.ts mobile/src/workflows/registry/releaseManifest.test.ts mobile/src/workflows/registry/builtin.ts mobile/src/workflows/registry/types.ts
git commit -m "feat: pin builtin workflow releases"
```

### Task 4: Reconcile releases atomically

**Files:**
- Create: `mobile/src/workflows/registry/releaseCoordinator.ts`
- Create: `mobile/src/workflows/registry/releaseCoordinator.test.ts`
- Modify: `mobile/src/workflows/registry/repository.ts`
- Modify: `mobile/src/workflows/registry/repository.test.ts`
- Modify: `mobile/src/workflows/registry/types.ts`
- Modify: `mobile/src/workflows/registry/service.ts`
- Modify: `mobile/src/workflows/registry/service.test.ts`
- Modify: `mobile/src/storage/backup.ts`
- Modify: `mobile/src/storage/backup.test.ts`
- Modify: `mobile/src/storage/DatabaseRecoveryScreen.tsx`
- Modify: `mobile/src/storage/DatabaseRecoveryScreen.test.tsx`
- Modify: `mobile/app/_layout.tsx`
- Test: `mobile/src/workflows/registry/releaseCoordinator.test.ts`

- [ ] **Step 1: Write the affected-device upgrade test against real SQLite**

```ts
test('accepts the exact historical v1.0.0 identity, preserves provenance, and activates v1.0.1', async () => {
  const db = createHistoricalV7Fixture();
  const beforeRegistry = db.getFirstSync<any>("SELECT * FROM workflow_registry WHERE version='1.0.0'");
  const backup = jest.fn(() => 'autodl-h3-release-mobile-1.4.10.backup.db');
  const coordinator = createWorkflowReleaseCoordinator({ db: db as never, backup, now: () => 20 });

  const result = await coordinator.reconcile(builtinWorkflowReleases);

  expect(result.status).toBe('updated');
  expect(backup).toHaveBeenCalledTimes(1);
  expect(db.getFirstSync<any>("SELECT * FROM workflow_registry WHERE version='1.0.0'")).toEqual(beforeRegistry);
  expect(db.getFirstSync<any>("SELECT workflow_hash FROM tasks WHERE id='task-old'").workflow_hash).toBe(H3_V100_LEGACY_HASH);
  expect(db.getFirstSync<any>("SELECT version,previous_version FROM workflow_registry_active WHERE workflow_id='autodl.minimax-h3.i2v-15s'")).toEqual({
    version: '1.0.1',
    previous_version: '1.0.0',
  });
});
```

Add independent tests for clean install, second-run no-op, direct `1.0.0→1.0.3`, local-import active preservation, downgrade selection, undeclared tamper zero writes, reused `releaseId` with another digest, backup failure, transaction rollback, and rollback failure recovery. Add two explicit regression cases: (1) first application to a database whose rows and active pointers already match still backs up before appending the ledger, and (2) downgrade activation of an accepted historical coordinate uses that persisted historical hash rather than the Manifest's primary hash.

- [ ] **Step 2: Run coordinator/repository/backup tests and verify RED**

```powershell
npm test -- --runInBand src/workflows/registry/releaseCoordinator.test.ts src/workflows/registry/repository.test.ts src/storage/backup.test.ts
```

Expected: FAIL because the coordinator and batch repository contract do not exist.

- [ ] **Step 3: Add the batch reconciliation store contract**

```ts
export type BuiltinReleaseBatch = {
  releaseId: string;
  manifestHash: string;
  records: RegistryRecord[];
  activations: Array<{
    workflowId: string;
    version: string;
    contentHash: string;
  }>;
  appliedAt: number;
};

export type AppliedRegistryRelease = {
  releaseId: string;
  manifestHash: string;
  appliedAt: number;
};

export type RegistryActivePointer = {
  workflowId: string;
  version: string;
  contentHash: string;
  previousVersion?: string;
  previousHash?: string;
};

export type WorkflowRegistry = {
  // existing methods remain
  getAppliedRelease(releaseId: string): Promise<AppliedRegistryRelease | undefined>;
  getActivePointer(workflowId: string): Promise<RegistryActivePointer | undefined>;
  applyBuiltinRelease(batch: BuiltinReleaseBatch): Promise<void>;
};
```

For SQLite, `getActivePointer` returns the raw current/previous pointer without silently resolving to the previous record. `applyBuiltinRelease` opens one transaction, rechecks every coordinate, inserts missing records including `hash_scheme`, updates each active pointer once using the actual pre-batch pointer as previous, then writes `workflow_registry_releases`. A mismatch inside this final check throws and rolls back. After a successful rollback it throws `REGISTRY_RELEASE_TRANSACTION_ROLLED_BACK`; if rollback or the post-rollback integrity check fails, it records recovery and throws `REGISTRY_RELEASE_RECOVERY_REQUIRED`. The memory implementation mirrors the successful transaction/rollback semantics for focused catalog tests.

- [ ] **Step 4: Add release-labelled full backups**

```ts
export function createReleaseBackup(
  source: SQLiteDatabase,
  releaseId: string,
  manifestHash: string,
  deps: BackupDeps = expoBackupDeps,
): string {
  const safeReleaseId = releaseId.replace(/[^A-Za-z0-9._-]/g, '-');
  const name = `autodl-h3-release-${safeReleaseId}-${manifestHash.slice(0, 12)}-${deps.now()}.backup.db`;
  const destination = deps.open(name);
  try {
    deps.backup({ sourceDatabase: source, destDatabase: destination });
    return name;
  } finally {
    destination.closeSync();
  }
}
```

Backup tests assert filename sanitization, destination closure on success/failure, and that the coordinator never calls `applyBuiltinRelease` after backup failure.

Add full-backup discovery and restore to the same module. Only names created by pre-migration or release backups are eligible; verify the source database before copying it over the open application database:

```ts
const FULL_BACKUP_NAME = /^autodl-h3-(?:v\d+-to-v\d+|release-[A-Za-z0-9._-]+-[0-9a-f]{12})-(\d+)\.backup\.db$/;

export function listFullDatabaseBackups(deps: Pick<RestoreBackupDeps, 'listNames'>): string[] {
  return deps.listNames()
    .map((name) => ({ name, timestamp: Number(FULL_BACKUP_NAME.exec(name)?.[1] ?? -1) }))
    .filter((item) => item.timestamp >= 0)
    .sort((left, right) => right.timestamp - left.timestamp)
    .map((item) => item.name);
}

export function restoreFullDatabaseBackup(
  destination: SQLiteDatabase,
  backupName: string,
  deps: RestoreBackupDeps = expoRestoreBackupDeps,
): void {
  if (!FULL_BACKUP_NAME.test(backupName) || !deps.listNames().includes(backupName)) {
    throw new Error('REGISTRY_RELEASE_BACKUP_NOT_FOUND');
  }
  const source = deps.open(backupName);
  try {
    const check = source.getFirstSync<{ integrity_check: string }>('PRAGMA integrity_check');
    if (check?.integrity_check !== 'ok') throw new Error('REGISTRY_RELEASE_BACKUP_INVALID');
    deps.backup({ sourceDatabase: source, destDatabase: destination });
  } finally {
    source.closeSync();
  }
}
```

The Expo dependency implementation lists `defaultDatabaseDirectory` with `expo-file-system`, returning filenames only. `DatabaseRecoveryScreen` receives `backupNames`, `onRestore(name): Promise<void>`, shows the newest backup timestamp, and requires confirmation before restore. `app/_layout.tsx` calls `restoreFullDatabaseBackup(startupDatabase, name)` and then exits the Android process only after success; reopening guarantees all database singletons are rebuilt against the restored file (React Native's release implementation of `DevSettings.reload()` is a no-op). Tests prove an invalid/missing backup never writes the destination, the source closes on every path, restore copies the full database rather than selected tables, and a failed restore remains on the read-only screen with a localized error.

- [ ] **Step 5: Implement preflight and reconciliation**

First extract the Registry service's current app-version, adapter-version, operation, and artifact-kind checks into `isWorkflowCompatible(definition, context): boolean`; `checkCompatibility` continues to throw `REGISTRY_INCOMPATIBLE` when this predicate is false, while the coordinator skips incompatible candidates. Add table-driven service tests proving both call paths agree. The coordinator then follows this exact order. Activation receives the *effective* record (the persisted historical record when one was accepted, otherwise the pinned package record):

```ts
type AcceptedHistoricalResult = {
  workflowId: string;
  version: string;
  identity: { scheme: WorkflowIdentityScheme; digest: string };
};

type PlannedActivation = {
  workflowId: string;
  version: string;
  contentHash: string;
  previousVersion?: string;
};

type CoordinatorDeps = {
  registry: WorkflowRegistry;
  backup: (releaseId: string, manifestHash: string) => string;
  now: () => number;
  isCompatible: (definition: WorkflowDefinition) => boolean;
};

async function chooseBuiltinActivations(
  registry: WorkflowRegistry,
  prepared: PreparedReleaseSet,
  effectiveRecords: ReadonlyMap<string, RegistryRecord>,
  isCompatible: CoordinatorDeps['isCompatible'],
): Promise<PlannedActivation[]> {
  const byWorkflow = new Map<string, PreparedBuiltinRelease[]>();
  for (const release of prepared.releases) {
    if (!isCompatible(release.definition)) continue;
    const versions = byWorkflow.get(release.record.workflowId) ?? [];
    versions.push(release);
    byWorkflow.set(release.record.workflowId, versions);
  }
  const activations: PlannedActivation[] = [];
  for (const [workflowId, releases] of byWorkflow) {
    const selected = [...releases].sort((left, right) => compareVersions(right.record.version, left.record.version))[0];
    const target = effectiveRecords.get(`${workflowId}\u0000${selected.record.version}`);
    if (!target) throw new RegistryReleaseError('REGISTRY_RELEASE_TARGET_MISSING');
    const pointer = await registry.getActivePointer(workflowId);
    const active = pointer ? await registry.get(pointer.workflowId, pointer.version) : undefined;
    if (pointer && (!active || active.contentHash !== pointer.contentHash)) {
      throw new RegistryReleaseError('REGISTRY_ACTIVE_POINTER_INVALID');
    }
    if (active && active.source !== 'builtin') continue;
    if (active?.version === target.version && active.contentHash === target.contentHash) continue;
    activations.push({
      workflowId,
      version: target.version,
      contentHash: target.contentHash,
      previousVersion: active?.version,
    });
  }
  return activations;
}

export function createWorkflowReleaseCoordinator(deps: CoordinatorDeps): WorkflowReleaseCoordinator {
  return {
    async reconcile(releaseSet) {
      const prepared = await prepareBuiltinReleaseSet(releaseSet);
      const applied = await deps.registry.getAppliedRelease(prepared.releaseId);
      if (applied?.manifestHash === prepared.manifestHash) return { status: 'unchanged' };
      if (applied) throw new RegistryReleaseError('REGISTRY_RELEASE_ID_REUSED');

      const records: RegistryRecord[] = [];
      const acceptedHistorical: AcceptedHistoricalResult[] = [];
      const effectiveRecords = new Map<string, RegistryRecord>();
      for (const release of prepared.releases) {
        const coordinate = `${release.record.workflowId}\u0000${release.record.version}`;
        const existing = await deps.registry.get(release.record.workflowId, release.record.version);
        if (!existing) {
          const record = { ...release.record, installedAt: deps.now() };
          records.push(record);
          effectiveRecords.set(coordinate, record);
          continue;
        }
        if (existing.contentHash === release.record.contentHash && existing.hashScheme === release.record.hashScheme) {
          effectiveRecords.set(coordinate, existing);
          continue;
        }
        const payload: unknown = JSON.parse(existing.definitionJson);
        if (computeWorkflowDigest(payload, existing.hashScheme) !== existing.contentHash) {
          throw new RegistryReleaseError('REGISTRY_STORED_DIGEST_INVALID');
        }
        const historical = release.acceptedHistorical.find((item) =>
          item.identity.digest === existing.contentHash &&
          item.identity.scheme === existing.hashScheme &&
          item.format === detectWorkflowRepresentation(payload).format,
        );
        if (!historical) throw new RegistryReleaseError('REGISTRY_IMMUTABLE_VERSION_CONFLICT');
        acceptedHistorical.push({ workflowId: existing.workflowId, version: existing.version, identity: historical.identity });
        effectiveRecords.set(coordinate, existing);
      }

      const activations = await chooseBuiltinActivations(deps.registry, prepared, effectiveRecords, deps.isCompatible);
      // A missing ledger row is itself a persistent change, so every first application is backed up.
      let backupName: string;
      try {
        backupName = deps.backup(prepared.releaseId, prepared.manifestHash);
      } catch (cause) {
        throw new RegistryReleaseError('REGISTRY_RELEASE_BACKUP_FAILED', { cause });
      }
      await deps.registry.applyBuiltinRelease({
        releaseId: prepared.releaseId,
        manifestHash: prepared.manifestHash,
        records,
        activations,
        appliedAt: deps.now(),
      });
      return {
        status: 'updated',
        installed: records.map(({ workflowId, version }) => ({ workflowId, version })),
        acceptedHistorical,
        activated: activations.map(({ workflowId, version, previousVersion }) => ({ workflowId, version, previousVersion })),
        backupName,
      };
    },
  };
}
```

- [ ] **Step 6: Run coordinator/repository/backup tests and verify GREEN**

Run the Step 2 command. Expected: all suites PASS, including byte-for-byte historical-row preservation and transaction rollback.

- [ ] **Step 7: Commit atomic reconciliation**

```powershell
git add mobile/src/workflows/registry/releaseCoordinator.ts mobile/src/workflows/registry/releaseCoordinator.test.ts mobile/src/workflows/registry/repository.ts mobile/src/workflows/registry/repository.test.ts mobile/src/workflows/registry/types.ts mobile/src/workflows/registry/service.ts mobile/src/workflows/registry/service.test.ts mobile/src/storage/backup.ts mobile/src/storage/backup.test.ts mobile/src/storage/DatabaseRecoveryScreen.tsx mobile/src/storage/DatabaseRecoveryScreen.test.tsx mobile/app/_layout.tsx
git commit -m "feat: reconcile builtin workflow releases atomically"
```

### Task 5: Wire catalog bootstrap and safe UI diagnostics

**Files:**
- Modify: `mobile/src/workflows/registry/catalog.ts`
- Modify: `mobile/src/workflows/registry/catalog.test.ts`
- Modify: `mobile/src/workflows/registry/builtin.ts`
- Modify: `mobile/src/create/CreateForm.tsx`
- Modify: `mobile/src/create/createForm.test.ts`

- [ ] **Step 1: Write failing catalog and CreateForm tests**

```ts
test('delegates builtin releases once and lists the reconciled active workflow', async () => {
  const registry = createWorkflowRegistry(undefined);
  const activeRecord: RegistryRecord = {
    workflowId: 'autodl.minimax-h3.i2v-15s',
    version: '1.0.1',
    contentHash: 'fe166625b82f953d23eac160ed509f468b2383b7d7c8be6383abca9096381897',
    hashScheme: WORKFLOW_PACKAGE_IDENTITY_V1,
    source: 'builtin',
    trust: 'builtin',
    definitionJson: canonicalizeDefinition(h3V101Package),
    installedAt: 1,
  };
  await registry.upsert(activeRecord);
  await registry.setActive(activeRecord.workflowId, activeRecord.version, activeRecord.contentHash);
  const coordinator = { reconcile: jest.fn(async () => ({ status: 'unchanged' as const })) };
  const catalog = createWorkflowCatalog({ registry, coordinator, releaseSet: builtinWorkflowReleases });
  await catalog.bootstrap();
  expect(coordinator.reconcile).toHaveBeenCalledTimes(1);
  expect((await catalog.listActive())[0].version).toBe('1.0.1');
});

test('shows a localized upgrade diagnostic instead of a raw immutability exception', async () => {
  const definition = builtinWorkflowDefinitions[0];
  const historicalActiveRecord: RegistryRecord = {
    workflowId: definition.id,
    version: definition.version,
    contentHash: '917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390',
    hashScheme: LEGACY_DEFINITION_IDENTITY_V1,
    source: 'builtin',
    trust: 'builtin',
    definitionJson: canonicalizeDefinition(definition),
    installedAt: 1,
  };
  const catalog = {
    bootstrap: jest.fn(async () => { throw new RegistryReleaseError('REGISTRY_IMMUTABLE_VERSION_CONFLICT'); }),
    listActive: jest.fn(async () => [historicalActiveRecord]),
    getActive: jest.fn(async () => historicalActiveRecord),
  };
  const readSettings = jest.fn(async () => ({
    token: '', llmEndpoint: '', llmModel: '', llmApiKey: '', llmTimeoutSeconds: '600',
    llmMaxRetries: '2', autoExportToGallery: true, keepPrivateCopy: true,
  }));
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(createElement(CreateForm, { submissionDependencies: { catalog, readSettings, queue: jest.fn() } }));
    await Promise.resolve();
  });
  expect(tree.root.findAllByType(Text).map((node) => node.props.children).join(' ')).toContain('工作流升级校验失败');
  expect(tree.root.findAllByType(Text).map((node) => node.props.children).join(' ')).not.toContain('workflow definition is immutable');
});
```

Import `createWorkflowRegistry`, the concrete package/identity helpers, and the existing renderer helpers used above. Remove the catalog test's hand-written `memoryRegistry()` so these tests exercise the same in-memory repository implementation as coordinator tests.

Add a test proving a safely rolled-back release update still renders the existing valid active workflow, while an invalid active digest disables submission and shows the recovery diagnostic.

- [ ] **Step 2: Run catalog and form tests and verify RED**

```powershell
npm test -- --runInBand src/workflows/registry/catalog.test.ts src/create/createForm.test.ts
```

Expected: FAIL because catalog still loops over builtins and CreateForm renders raw exception messages.

- [ ] **Step 3: Delegate bootstrap to the coordinator**

Replace the builtin installation loop and the current implicit previous-pointer fallback with strict active-pointer discovery:

```ts
async function strictActiveRecord(
  registry: WorkflowRegistry,
  workflowId: string,
): Promise<RegistryRecord | undefined> {
  const pointer = await registry.getActivePointer(workflowId);
  if (!pointer) return undefined;
  const record = await registry.get(pointer.workflowId, pointer.version);
  if (!record || record.contentHash !== pointer.contentHash) {
    throw new RegistryReleaseError('REGISTRY_ACTIVE_POINTER_INVALID');
  }
  return record;
}

export function createWorkflowCatalog(deps: {
  registry: WorkflowRegistry;
  coordinator: WorkflowReleaseCoordinator;
  releaseSet: BuiltinWorkflowReleaseSet;
}) {
  return {
    async bootstrap(): Promise<ReleaseReconcileResult> {
      return deps.coordinator.reconcile(deps.releaseSet);
    },
    async listActive(): Promise<RegistryRecord[]> {
      const workflowIds = [...new Set((await deps.registry.list()).map((record) => record.workflowId))].sort();
      const active = await Promise.all(workflowIds.map((workflowId) => strictActiveRecord(deps.registry, workflowId)));
      return active.filter((record): record is RegistryRecord => Boolean(record));
    },
    async getActive(workflowId: string): Promise<RegistryRecord | undefined> {
      return strictActiveRecord(deps.registry, workflowId);
    },
    // retain activate and rollback
  };
}
```

`createAppWorkflowCatalog` creates one registry/coordinator pair from the shared database and passes `builtinWorkflowReleases`.

- [ ] **Step 4: Normalize release errors before presentation**

Add a pure formatter close to `CreateForm`:

```ts
const SAFE_EXISTING_CATALOG_CODES = new Set<RegistryReleaseErrorCode>([
  'REGISTRY_RELEASE_MANIFEST_INVALID',
  'REGISTRY_RELEASE_DUPLICATE_COORDINATE',
  'REGISTRY_RELEASE_DIGEST_MISMATCH',
  'REGISTRY_RELEASE_ID_REUSED',
  'REGISTRY_IMMUTABLE_VERSION_CONFLICT',
  'REGISTRY_RELEASE_BACKUP_FAILED',
  'REGISTRY_RELEASE_TRANSACTION_ROLLED_BACK',
]);

function workflowLoadMessage(error: unknown): string {
  if (error instanceof RegistryReleaseError) {
    if (error.code === 'REGISTRY_IMMUTABLE_VERSION_CONFLICT') {
      return '工作流升级校验失败，已保留现有数据。请恢复备份或联系支持。';
    }
    if (error.code === 'REGISTRY_RELEASE_BACKUP_FAILED') {
      return '工作流升级前备份失败，已保留当前版本。';
    }
    if (error.code === 'REGISTRY_STORED_DIGEST_INVALID' || error.code === 'REGISTRY_ACTIVE_POINTER_INVALID') {
      return '工作流数据完整性校验失败，请从完整数据库备份恢复。';
    }
    if (error.code === 'REGISTRY_RELEASE_RECOVERY_REQUIRED') {
      return '工作流升级恢复失败，数据库已进入只读保护模式。';
    }
    return '工作流升级失败，已保留当前版本。';
  }
  return '工作流加载失败';
}
```

On a `RegistryReleaseError` whose code is in `SAFE_EXISTING_CATALOG_CODES`, call strict `catalog.listActive()` and render that record while showing the localized warning. Do not fall back for stored-digest, active-pointer, or recovery-required errors. If strict fallback discovery itself fails, preserve the integrity diagnostic and keep submission disabled.

- [ ] **Step 5: Run catalog/form tests and verify GREEN**

Run the Step 2 command. Expected: all tests PASS; no raw internal English exception reaches rendered text.

- [ ] **Step 6: Commit application wiring**

```powershell
git add mobile/src/workflows/registry/catalog.ts mobile/src/workflows/registry/catalog.test.ts mobile/src/workflows/registry/builtin.ts mobile/src/create/CreateForm.tsx mobile/src/create/createForm.test.ts
git commit -m "fix: migrate builtin workflows during catalog bootstrap"
```

### Task 6: Add release verification and perform full acceptance

**Files:**
- Create: `mobile/scripts/verify-workflow-releases.mjs`
- Modify: `mobile/package.json`
- Modify: `mobile/package-lock.json`
- Modify: `mobile/app.json`
- Modify: `mobile/android/app/build.gradle`
- Modify: `.github/workflows/release.yml`
- Verify: affected Android emulator `emulator-5554`

- [ ] **Step 1: Write a failing release verifier invocation**

Add the package script before creating its file:

```json
{
  "scripts": {
    "verify:workflow-releases": "node scripts/verify-workflow-releases.mjs"
  }
}
```

Run:

```powershell
npm run verify:workflow-releases
```

Expected: FAIL with `Cannot find module .../scripts/verify-workflow-releases.mjs`.

- [ ] **Step 2: Implement the independent verifier**

The script reads every package, `release-manifest.json`, and `release-history.json` without importing application runtime code. It verifies package digests, exact Manifest file coverage, coordinate order/uniqueness, the normalized Manifest digest, and append-only history against an optional Git base ref:

```js
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const root = new URL('../src/workflows/definitions/autodl/', import.meta.url);
const encode = (value) => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${encode(value[key])}`).join(',')}}`;
  }
  throw new Error('unsupported canonical value');
};
const sha256 = (value) => createHash('sha256').update(encode(value)).digest('hex');
const parseVersion = (value) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw new Error(`invalid workflow semver: ${value}`);
  return match.slice(1).map(Number);
};
const compareCoordinates = (left, right) => {
  const id = left.id.localeCompare(right.id);
  if (id) return id;
  const a = parseVersion(left.version); const b = parseVersion(right.version);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
};

const manifest = JSON.parse(await readFile(new URL('release-manifest.json', root), 'utf8'));
const history = JSON.parse(await readFile(new URL('release-history.json', root), 'utf8'));
if (manifest.apiVersion !== 'autodl.workflow-release-set/v1' || typeof manifest.releaseId !== 'string') {
  throw new Error('invalid workflow release manifest envelope');
}
const packageNames = (await readdir(root)).filter((value) => value.endsWith('.package.json')).sort();
const packages = new Map();
const seen = new Set();
for (const name of packageNames) {
  const pkg = JSON.parse(await readFile(new URL(name, root), 'utf8'));
  const declared = pkg.metadata?.contentHash;
  const metadata = { ...pkg.metadata };
  delete metadata.contentHash;
  const digest = sha256({ ...pkg, metadata });
  const coordinate = `${pkg.metadata?.id}\u0000${pkg.metadata?.version}`;
  if (seen.has(coordinate)) throw new Error(`duplicate workflow coordinate: ${coordinate.replace('\u0000', '@')}`);
  seen.add(coordinate);
  if (declared !== digest) throw new Error(`workflow digest mismatch: ${name}`);
  packages.set(name, { pkg, digest, id: pkg.metadata.id, version: pkg.metadata.version });
}

const manifestNames = manifest.releases.map((release) => release.packageFile);
if (new Set(manifestNames).size !== manifestNames.length ||
    JSON.stringify([...manifestNames].sort()) !== JSON.stringify(packageNames)) {
  throw new Error('release Manifest must reference every pinned package exactly once');
}
const coordinates = manifest.releases.map((release) => {
  const pinned = packages.get(release.packageFile);
  if (!pinned || release.identity?.scheme !== 'workflow-package/without-declared-hash+sorted-json@1' ||
      release.identity.digest !== pinned.digest) throw new Error(`release identity mismatch: ${release.packageFile}`);
  for (const historical of release.acceptedHistorical ?? []) {
    if (historical.workflowId !== pinned.id || historical.version !== pinned.version ||
        !['workflow-definition/sorted-json@1', 'workflow-package/without-declared-hash+sorted-json@1'].includes(historical.identity?.scheme) ||
        !/^[0-9a-f]{64}$/.test(historical.identity?.digest ?? '')) {
      throw new Error(`invalid historical identity: ${release.packageFile}`);
    }
  }
  return { id: pinned.id, version: pinned.version };
});
const sortedCoordinates = [...coordinates].sort(compareCoordinates);
if (coordinates.some((coordinate, index) => compareCoordinates(coordinate, sortedCoordinates[index]) !== 0)) {
  throw new Error('release Manifest coordinates are not sorted');
}
const runtimeSet = {
  apiVersion: manifest.apiVersion,
  releaseId: manifest.releaseId,
  releases: manifest.releases.map(({ packageFile, ...release }) => ({ ...release, package: packages.get(packageFile).pkg })),
  activation: manifest.activation,
};
const manifestHash = sha256(runtimeSet);
if (history[manifest.releaseId] !== manifestHash) throw new Error('release history digest mismatch');

const baseIndex = process.argv.indexOf('--base-ref');
if (baseIndex >= 0) {
  const baseRef = process.argv[baseIndex + 1];
  if (!baseRef) throw new Error('--base-ref requires a Git ref');
  let baseHasHistory = true;
  try {
    execFileSync('git', [
      'cat-file', '-e', `${baseRef}:mobile/src/workflows/definitions/autodl/release-history.json`,
    ], { stdio: 'ignore' });
  } catch {
    baseHasHistory = false;
    console.log(`base ${baseRef} predates the release-history ledger`);
  }
  const priorHistory = baseHasHistory
    ? JSON.parse(execFileSync('git', [
        'show', `${baseRef}:mobile/src/workflows/definitions/autodl/release-history.json`,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
    : {};
  for (const [releaseId, digest] of Object.entries(priorHistory)) {
    if (history[releaseId] !== digest) throw new Error(`release history entry changed or disappeared: ${releaseId}`);
  }
}
console.log(`verified ${seen.size} pinned workflow releases and ${manifest.releaseId}@${manifestHash}`);
```

- [ ] **Step 3: Bump the application release version consistently**

Set:

```text
mobile/package.json version = 1.4.10
mobile/package-lock.json root/package version = 1.4.10
mobile/app.json expo.version = 1.4.10
mobile/android/app/build.gradle versionName = "1.4.10"
mobile/android/app/build.gradle versionCode = 20
```

Add `npm run verify:workflow-releases` to `.github/workflows/release.yml` after dependency installation and before typecheck/Jest/Gradle. The release job already has full Git history; calculate `previous_tag` with the same version-sort expression used for release notes and, when present, invoke `npm run verify:workflow-releases -- --base-ref "$previous_tag"`. The first release that introduces the history file runs without `--base-ref` when its previous tag does not contain that file.

- [ ] **Step 4: Run focused and full automated verification**

```powershell
npm run verify:workflow-releases
npm run typecheck
npm test -- --runInBand
```

Expected: verifier reports 2 pinned releases; typecheck exits 0; all Jest suites pass with zero failed tests.

- [ ] **Step 5: Preserve a before-upgrade evidence snapshot from the affected emulator**

Before installing the new APK, copy `files/SQLite/autodl-h3.db` with `adb exec-out run-as`, then record counts and hashes for `tasks`, `media_assets`, `workflow_jobs`, Registry `1.0.0`, settings, and cached media. Store evidence under `docs/superpowers/verification/2026-09-04-workflow-release-migration/`; do not store token values or user payload contents.

- [ ] **Step 6: Build and install without clearing emulator data**

```powershell
cd mobile/android
.\gradlew.bat :app:installDebug --console=plain
```

Expected: `BUILD SUCCESSFUL`, `Installed on 1 device`; do not call `pm clear` or uninstall the package.

- [ ] **Step 7: Verify the migrated application and persisted data**

```powershell
$autodlAdb = 'C:\Users\Administrator\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $autodlAdb -s emulator-5554 logcat -c
& $autodlAdb -s emulator-5554 shell am force-stop com.example.autodlh3
& $autodlAdb -s emulator-5554 shell am start -W -n com.example.autodlh3/.MainActivity
```

Expected:

- cold launch status is `ok`;
- full Prompt and generation-parameter sections render;
- `workflow definition is immutable` is absent from the UI and process log;
- `workflow_registry@1.0.0` remains legacy hash `917c...` and byte-identical payload;
- `workflow_registry@1.0.1` exists with package hash `fe166...`;
- active is `1.0.1`, previous is historical `1.0.0`;
- pre/post task, media, job, settings, and cache counts match;
- crash buffer is empty.

Capture a screenshot and a redacted post-upgrade database summary in the verification directory.

- [ ] **Step 8: Verify a clean-install emulator path**

Use a separate clean AVD or a separately named application-data snapshot. Install the same APK, launch it, and confirm both package-backed versions are installed, `1.0.1` is active, the full form renders, and no historical compatibility branch was taken.

- [ ] **Step 9: Check the final diff and commit release integration**

```powershell
git diff --check
git status --short
git add mobile/scripts/verify-workflow-releases.mjs mobile/package.json mobile/package-lock.json mobile/app.json mobile/android/app/build.gradle .github/workflows/release.yml docs/superpowers/verification/2026-09-04-workflow-release-migration
git commit -m "chore: verify workflow release migration"
```

- [ ] **Step 10: Run post-commit verification**

```powershell
npm run verify:workflow-releases
npm run typecheck
npm test -- --runInBand
cd android
.\gradlew.bat :app:assembleDebug --console=plain
git status --short --branch
```

Expected: all commands exit 0 and the working tree is clean.
