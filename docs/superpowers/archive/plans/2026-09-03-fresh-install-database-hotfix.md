# Fresh-install Database Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a genuinely fresh SQLite database immediately usable, preserve legacy-data gates, and publish the fix as v1.4.7.

**Architecture:** Extend the existing v5 database bootstrap with a narrow fresh-install branch: version 0 plus no recognized app tables initializes the complete schema transactionally, while version 0 with legacy tables remains untouched. Keep the generic versioned runner deferred to C-Core and verify this hotfix with real `node:sqlite` tests.

**Tech Stack:** TypeScript 6, Jest 29, `node:sqlite`, Expo SQLite, React Native/Android Gradle, GitHub Actions, GitHub CLI.

---

### Task 1: Fresh database initialization and recovery reset

**Files:**
- Modify: `mobile/src/storage/database.test.ts`
- Modify: `mobile/src/storage/database.ts:14-38,63-70,115-134`

- [ ] **Step 1: Add real SQLite regression tests**

Import `readAppSchemaVersion`, `createRealSqliteTestDb`, and `createWorkflowRegistry`, then add tests equivalent to:

```ts
test('initializes a fresh database with the complete current schema', () => {
  const db = createRealSqliteTestDb();
  try {
    ensureAppDatabase(db as never);
    expect(readAppSchemaVersion(db as never)).toBe(APP_SCHEMA_VERSION);
    const names = db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(['tasks', 'workflow_jobs', 'workflow_registry', 'workflow_registry_active', 'app_database_recovery']));
  } finally { db.close(); }
});

test('fresh initialization is repeatable', () => {
  const db = createRealSqliteTestDb();
  try {
    ensureAppDatabase(db as never);
    ensureAppDatabase(db as never);
    expect(readAppSchemaVersion(db as never)).toBe(APP_SCHEMA_VERSION);
    expect(db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE name='workflow_registry'")).toHaveLength(1);
  } finally { db.close(); }
});

test('does not stamp a version-zero database containing legacy app data', () => {
  const db = createRealSqliteTestDb();
  try {
    db.execSync('CREATE TABLE tasks (id TEXT PRIMARY KEY NOT NULL)');
    ensureAppDatabase(db as never);
    expect(readAppSchemaVersion(db as never)).toBe(0);
    expect(db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE name='workflow_registry'")).toHaveLength(0);
  } finally { db.close(); }
});

test('fresh initialization supports workflow registry activation', async () => {
  const db = createRealSqliteTestDb();
  try {
    ensureAppDatabase(db as never);
    const registry = createWorkflowRegistry(db as never);
    await registry.installAndActivate({ workflowId: 'demo', version: '1.0.0', contentHash: 'abc', source: 'builtin', trust: 'builtin', definitionJson: '{}', installedAt: 1 });
    await expect(registry.getActive('demo')).resolves.toMatchObject({ workflowId: 'demo', contentHash: 'abc' });
  } finally { db.close(); }
});

test('migrates version four additively without deleting registry data', () => {
  const db = createRealSqliteTestDb();
  try {
    resetAppDatabase(db as never);
    db.runSync("INSERT INTO workflow_registry (workflow_id,version,content_hash,source,trust,definition_json,installed_at) VALUES (?,?,?,?,?,?,?)", 'demo', '1.0.0', 'abc', 'builtin', 'builtin', '{}', 1);
    db.execSync('PRAGMA user_version = 4');
    ensureAppDatabase(db as never);
    expect(readAppSchemaVersion(db as never)).toBe(APP_SCHEMA_VERSION);
    expect(db.getFirstSync<{ count: number }>("SELECT COUNT(*) AS count FROM workflow_registry WHERE workflow_id='demo'")?.count).toBe(1);
  } finally { db.close(); }
});

test('reset clears a persisted recovery marker', () => {
  const db = createRealSqliteTestDb();
  try {
    db.execSync("CREATE TABLE app_database_recovery (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), diagnostic TEXT NOT NULL, created_at INTEGER NOT NULL); INSERT INTO app_database_recovery VALUES (1, 'failed', 1)");
    resetAppDatabase(db as never);
    expect(getAppRecoveryState(db as never)).toBeUndefined();
  } finally { db.close(); }
});
```

- [ ] **Step 2: Run the focused tests and record RED**

Run: `cd mobile; npm test -- --runInBand src/storage/database.test.ts`

Expected: the fresh initialization test reports version 0 instead of 5 and the reset test still reads the old recovery diagnostic.

- [ ] **Step 3: Implement the minimal fresh-install branch**

Add the recovery table to the reset-owned table list and gate migration as follows:

```ts
const APP_TABLES = [
  'workflow_artifacts',
  'workflow_jobs',
  'media_deliveries',
  'media_assets',
  'tasks',
  'workflow_registry_active',
  'workflow_registry',
  'prompt_drafts',
  'agent_threads',
  'app_scheduler_leases',
  RECOVERY_TABLE,
];

const freshInstall = version === 0 && !isLegacyAppDatabase(db);
if (!freshInstall && version !== APP_SCHEMA_VERSION - 1) return;
try {
  if (!freshInstall) options.backup?.();
  withTransaction(db, () => {
    for (const statement of APP_CREATE_STATEMENTS) db.execSync(statement);
    db.execSync(`CREATE TABLE IF NOT EXISTS ${RECOVERY_TABLE} (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), diagnostic TEXT NOT NULL, created_at INTEGER NOT NULL)`);
    db.execSync(`PRAGMA user_version = ${APP_SCHEMA_VERSION}`);
  });
} catch (error) {
  markRecovery(db, error instanceof Error ? error.message : String(error));
  throw error;
}
```

Keep current/future-version early returns unchanged. Do not accept all versions below 5, and do not restore Registry-owned DDL.

- [ ] **Step 4: Verify focused GREEN and adjacent Registry coverage**

Run: `cd mobile; npm test -- --runInBand src/storage/database.test.ts src/workflows/registry/repository.test.ts src/workflows/registry/catalog.test.ts`

Expected: all selected suites pass, including the new real SQLite cases.

- [ ] **Step 5: Commit the database fix**

```powershell
git add -- mobile/src/storage/database.ts mobile/src/storage/database.test.ts
git commit -m "fix: initialize workflow registry on fresh install"
```

### Task 2: Version v1.4.7

**Files:**
- Modify: `mobile/package.json:3`
- Modify: `mobile/package-lock.json:3,9`
- Modify: `mobile/app.json:6`
- Modify: `mobile/android/app/build.gradle:107-108`

- [ ] **Step 1: Update JavaScript package versions mechanically**

Run: `cd mobile; npm version 1.4.7 --no-git-tag-version`

Expected: only the root versions in `package.json` and `package-lock.json` change from 1.4.6 to 1.4.7.

- [ ] **Step 2: Update Expo and Android versions**

Apply these exact values:

```json
"version": "1.4.7"
```

```gradle
versionCode 17
versionName "1.4.7"
```

- [ ] **Step 3: Verify version ownership**

Run a Node check that reads `mobile/app.json`, `mobile/package.json`, and `mobile/android/app/build.gradle` and asserts every version name is `1.4.7` and `versionCode` is 17.

Expected: exit code 0 and the printed values all match.

- [ ] **Step 4: Commit the release version**

```powershell
git add -- mobile/package.json mobile/package-lock.json mobile/app.json mobile/android/app/build.gradle
git commit -m "chore: bump version to 1.4.7"
```

### Task 3: Verification, PR, merge, tag, and release

**Files:**
- Verify: all changed files and `.github/workflows/release.yml`

- [ ] **Step 1: Run local quality gates**

Run from `mobile`:

```powershell
$env:CI='true'
npm run typecheck
npm test -- --runInBand
```

Expected: typecheck succeeds and all Jest suites complete with zero failed tests. Do not use `--forceExit`; record the known post-summary handle warning if it persists.

- [ ] **Step 2: Build the Android debug artifact**

Use a supported JDK 17 or 21 and the locally installed Android SDK, then run:

```powershell
cd mobile/android
./gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64 --no-daemon --console=plain
```

Expected: `BUILD SUCCESSFUL` and a non-empty debug APK.

- [ ] **Step 3: Inspect the branch and request code review**

Run:

```powershell
git diff --check origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
```

Dispatch the required code reviewer with `origin/main` as the base and fix every Critical or Important finding before continuing.

- [ ] **Step 4: Push and create the PR**

Push `codex/fresh-install-hotfix`, create a PR targeting `main`, and include root cause, fresh/legacy behavior, RED→GREEN evidence, full test counts, and Android build evidence.

- [ ] **Step 5: Wait for checks and merge the PR**

Use GitHub PR checks/status. Merge only after all required checks succeed and the PR is mergeable. Verify the resulting merge commit is present on `origin/main`.

- [ ] **Step 6: Create and push the annotated release tag**

At the verified merge commit:

```powershell
$releaseMergeSha = git rev-parse origin/main
git merge-base --is-ancestor $releaseMergeSha origin/main
if ($LASTEXITCODE -ne 0) { throw 'release commit is not on origin/main' }
git tag -a v1.4.7 $releaseMergeSha -m "AutoDL H3 v1.4.7"
git push origin v1.4.7
```

Before pushing, verify the tag does not already exist and `$releaseMergeSha` is the PR merge commit on `origin/main`.

- [ ] **Step 7: Verify the GitHub Actions release**

Wait for the tag-triggered `Android Release` workflow. Require successful version ownership, typecheck, Jest, signed universal APK build, ABI inspection, `apksigner` verification, and Release creation.

- [ ] **Step 8: Verify the published artifact**

Use `gh release view v1.4.7` and download the release asset to a temporary directory. Confirm the asset is non-empty, compute SHA-256, and report the Release URL, workflow run URL, asset name, size, and hash. Do not retain the temporary download after verification.
