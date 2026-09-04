# Workflow Release Migration Design

> Date: 2026-09-04
> Target release: v1.4.10
> Database baseline: schema v6

## Goal

Provide a production-safe workflow release mechanism that upgrades devices carrying historical Registry rows without deleting user data, preserves immutable workflow provenance, and makes future builtin releases such as `1.0.2`, `1.0.3`, and later versions declarative rather than database-migration work.

## Confirmed failure

The current emulator contains builtin workflow `autodl.minimax-h3.i2v-15s@1.0.0` in the legacy `WorkflowDefinition` representation. Its stored digest is:

```text
workflow-definition/sorted-json@1
917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390
```

That row was installed before commit `f3456dc0`, which changed builtin hashing to convert legacy definitions into `WorkflowPackage` before canonicalization. The same semantic `1.0.0` release now produces:

```text
workflow-package/without-declared-hash+sorted-json@1
b3d2ac04b13f581527a580d49abea9d9cc079ee8c8a6681232cd2cdbfda8ce81
```

Catalog bootstrap attempts to reinstall every builtin version. Repository immutability correctly rejects the different digest for the same `{workflowId, version}`, so bootstrap stops before installing `1.0.1`. CreateForm then displays the raw `workflow definition is immutable` exception in place of the workflow description.

This is not an asset or Metro cache failure. Reinstalling with `adb install -r` preserves the conflicting SQLite row and therefore preserves the failure.

## Design choice

Use an immutable builtin Release Manifest with versioned identity schemes and exact historical representation declarations.

Database schema migrations remain responsible only for storage shape. Workflow content releases are reconciled through the Manifest. Normal releases such as `1.0.2` append a pinned package to the Manifest and do not add another SQL migration. A new historical declaration is required only when a released coordinate has a known earlier representation or identity scheme.

The design intentionally does not introduce a generic codec and migration graph. Format and hash protocols are named and versioned, but the runtime accepts only protocols compiled into the application. This keeps the release path small while retaining a future extension point.

## Invariants

- A released `{workflowId, version}` coordinate is immutable.
- A persisted Registry row is never overwritten merely to normalize its representation or digest.
- Historical `workflow_hash` values in tasks, jobs, active pointers, previous pointers, and artifact provenance remain valid.
- A historical representation is accepted only by exact coordinate, identity scheme, digest, and recomputed payload digest.
- An undeclared same-version mismatch remains an integrity error.
- Builtin reconciliation may advance or downgrade a builtin active record to the highest compatible version declared by the running APK, but it never replaces an active local-import or remote record.
- A Manifest is immutable by `releaseId`: reusing an ID with a different Manifest digest is rejected.
- Reconciliation is idempotent and changes active state at most once per workflow per run.
- Database backups precede schema changes and data-changing Manifest reconciliation.

## Pinned workflow packages

Builtin releases are stored as complete `WorkflowPackage` JSON documents rather than regenerated at runtime from mutable legacy conversion code. Each package declares a digest computed after omitting `metadata.contentHash` and applying its named canonicalizer.

The initial Manifest contains:

- `1.0.0`, primary package digest `b3d2ac04b13f581527a580d49abea9d9cc079ee8c8a6681232cd2cdbfda8ce81`;
- `1.0.0`, accepted historical legacy-definition digest `917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390`;
- `1.0.1`, primary package digest `fe166625b82f953d23eac160ed509f468b2383b7d7c8be6383abca9096381897`.

Future `1.0.2+` releases must be new package files with new semantic versions and pinned digests. CI rejects duplicate coordinates, malformed SemVer, digest mismatches, unsorted versions, a changed package for a previously released coordinate, or a reused `releaseId` with different content.

## Release Manifest interface

```ts
type WorkflowIdentity = Readonly<{
  scheme: string;
  digest: string;
}>;

type AcceptedHistoricalRepresentation = Readonly<{
  workflowId: string;
  version: string;
  identity: WorkflowIdentity;
  format: 'legacy-workflow-definition@1' | 'workflow-package@1';
}>;

type BuiltinWorkflowRelease = Readonly<{
  package: WorkflowPackage;
  identity: WorkflowIdentity;
  acceptedHistorical?: readonly AcceptedHistoricalRepresentation[];
}>;

type BuiltinWorkflowReleaseSet = Readonly<{
  apiVersion: 'autodl.workflow-release-set/v1';
  releaseId: string;
  releases: readonly BuiltinWorkflowRelease[];
  activation: Readonly<{
    select: 'highest-compatible-declared-version';
    replaceActiveSources: readonly ['builtin'];
    preserveUnlistedVersions: true;
  }>;
}>;

type ReleaseReconcileResult =
  | { status: 'unchanged' }
  | {
      status: 'updated';
      installed: readonly Array<{ workflowId: string; version: string }>;
      acceptedHistorical: readonly Array<{
        workflowId: string;
        version: string;
        identity: WorkflowIdentity;
      }>;
      activated: readonly Array<{
        workflowId: string;
        version: string;
        previousVersion?: string;
      }>;
      backupName: string;
    };

interface WorkflowReleaseCoordinator {
  reconcile(releaseSet: BuiltinWorkflowReleaseSet): Promise<ReleaseReconcileResult>;
}
```

The ordinary startup call remains one operation:

```ts
const result = await releaseCoordinator.reconcile(builtinWorkflowReleases);
const workflows = await catalog.listActive();
```

Catalog bootstrap delegates builtin installation and activation to the coordinator. It no longer loops over definitions and calls immutable `upsert` independently.

## Schema v7

Schema v7 is assigned to Registry Release identity metadata. This supersedes the earlier reservation of v7 for D-Core; D-Core moves to v8 because it has not started and no released database uses that version.

The v6-to-v7 migration:

1. adds `hash_scheme TEXT` to `workflow_registry`;
2. creates `workflow_registry_releases(release_id TEXT PRIMARY KEY, manifest_hash TEXT NOT NULL, applied_at INTEGER NOT NULL)`;
3. backfills legacy-definition rows with `workflow-definition/sorted-json@1`;
4. backfills package rows with `workflow-package/without-declared-hash+sorted-json@1`;
5. verifies that each row's stored digest matches its payload under the assigned scheme;
6. leaves every Registry digest, definition payload, active pointer, task, job, and artifact row unchanged.

Representation detection is strict: top-level `apiVersion === 'workflow.autodl/v1'` is package v1; the validated legacy shape is legacy definition v1. An unrecognized payload fails migration instead of guessing.

The existing migration runner performs a full database backup before entering its transaction. Failure records a redacted recovery diagnostic and retains the pre-migration database.

## Reconciliation algorithm

The coordinator validates the entire Manifest before opening a write transaction:

1. Verify the Manifest API version, unique `releaseId`, unique workflow coordinates, SemVer ordering, package schemas, identity scheme IDs, declared package digests, and historical declaration shapes.
2. Read the applied-release ledger. The same ID and digest is an idempotent no-op; the same ID with another digest is an integrity error.
3. Compare every declared release with its persisted coordinate.
4. Treat a matching primary digest as already installed.
5. For a mismatch, recompute the stored payload under its stored scheme. Accept it only when the recomputed value equals the stored digest and an exact historical declaration matches the coordinate, scheme, format, and digest.
6. Reject any other same-version mismatch before making a database change.
7. Determine all missing package rows and final active-pointer changes.
8. If changes are required, create one full database backup tied to `releaseId` and Manifest digest.
9. In one SQLite transaction, insert missing versions, update each eligible builtin active pointer once, and append the release ledger row.
10. Return a structured result for diagnostics and telemetry without exposing package contents or user data.

Historical rows accepted in step 5 remain authoritative for that installation. The coordinator does not insert the primary digest for the same coordinate and does not rewrite active, previous, task, or job hashes referring to the historical row.

When `1.0.2` is later appended, devices may upgrade directly from `1.0.0`, `1.0.1`, or a clean database. The same reconciliation computes the missing set, installs all declared missing packages, and moves a builtin active pointer directly to the highest compatible release. `previous_version` and `previous_hash` refer to the actual pre-upgrade active row, not an intermediate package installed during the same reconciliation.

## Failure and recovery behavior

- Manifest validation or undeclared immutable conflict occurs before writes and returns a stable Registry Release error code.
- Backup failure performs no database writes and leaves the existing active workflow usable.
- A reconciliation transaction failure rolls back all package, active-pointer, and ledger writes. If rollback and integrity checks succeed, the prior catalog remains usable and the update reports a localized failure.
- A rollback or integrity-check failure records a recovery marker and opens the application database read-only through the existing recovery UI.
- CreateForm never displays raw internal exceptions. It shows a localized workflow-upgrade diagnostic and preserves the current usable active workflow when the coordinator reports a safely rolled-back update failure.
- Recovery replaces the full database from a verified backup and requires application reload. Registry-only restoration is forbidden because it can desynchronize task and job provenance.

## Downgrade and non-builtin behavior

Manifest reconciliation preserves versions not declared by the current APK. If a downgraded APK cannot use the currently active builtin version, it selects the highest compatible declared builtin while retaining the newer row for a later upgrade.

An active local-import or remote record is never replaced automatically. Builtin packages may still be staged so they are available for explicit activation or later fallback.

## Garbage collection

Registry cleanup must treat the following as live references:

- current and previous active hashes;
- task and workflow-job hashes;
- workflow-artifact provenance;
- all releases declared by the running Manifest;
- historical identities accepted by a Manifest applied on the device.

Reconciliation never deletes Registry rows. Cleanup remains a separate explicit operation.

## Testing

Tests use the real SQLite adapter wherever persistence semantics matter.

### Schema migration

- A captured pre-`f3456dc0` v6 fixture upgrades to v7 without changing Registry, task, job, artifact, active, or previous hashes.
- Legacy and package rows receive the correct `hash_scheme`.
- Unknown or digest-invalid rows fail before schema v7 is stamped.
- Backup, transaction rollback, recovery marker, fresh install, repeated migration, and future-schema read-only behavior remain covered.

### Release reconciliation

- Historical `1.0.0 / 917c...` is accepted only by its exact declaration.
- The historical row remains byte-for-byte unchanged while `1.0.1` is installed and activated.
- A fresh database installs pinned `1.0.0` and `1.0.1` packages and activates `1.0.1`.
- Direct upgrade from historical `1.0.0` to a fixture `1.0.3` installs missing releases and changes active once.
- A second cold start is an idempotent no-op and creates no backup.
- A local-import or remote active record is preserved.
- Undeclared same-version changes, wrong schemes, wrong digests, changed Manifest IDs, and changed pinned packages fail with zero writes.
- Backup and transaction failures preserve the old active workflow; rollback failure enters recovery mode.
- Downgrade preserves newer rows and selects the highest compatible declared builtin.

### Build and device acceptance

- TypeScript typecheck and the full Jest suite pass.
- CI validates all pinned package and Manifest digests independently of runtime code.
- Android Debug builds a self-contained JS bundle and installs on the emulator.
- Upgrading the existing affected emulator without clearing app data removes `workflow definition is immutable`, renders the complete schema-driven form, activates `1.0.1`, and preserves existing tasks, gallery records, settings, and cached media.
- A clean emulator produces the same active workflow and form.

## Release discipline

After this migration ships:

- published workflow package files and identity protocol implementations are append-only;
- changing workflow behavior requires a new semantic version;
- changing format, canonicalization, or digest semantics requires a new named identity scheme;
- historical acceptance requires an exact reviewed declaration and regression fixture;
- normal workflow releases do not change `APP_SCHEMA_VERSION`;
- release artifacts are not published until Manifest verification, migration tests, full Jest, Android build, affected-device upgrade, and clean-install acceptance all pass.
