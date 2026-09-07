# Fresh-install Database Hotfix Design

> Date: 2026-09-03
> Target release: v1.4.7
> Base: `main` / v1.4.6

## Goal

Restore first-launch usability for a genuinely empty SQLite database without weakening the legacy-data confirmation gate or pulling the C-Core versioned migration runner into this release hotfix.

## Root cause

`ensureAppDatabase` only migrates schema version 4 to version 5. A fresh SQLite database reports `PRAGMA user_version = 0`, so the function returns without creating app-owned tables or recording schema version 5. Other repositories still create some of their own tables, but Workflow Registry intentionally no longer owns DDL. Its first query therefore fails with `no such table: workflow_registry`, and CreateForm cannot load a builtin workflow.

## Design

`ensureAppDatabase` will distinguish three cases:

1. An empty version-0 database with no recognized app-owned tables is a fresh install. In one transaction it creates the complete v5 schema, creates the recovery table, and sets `user_version` to 5.
2. A version-4 database continues through the existing additive 4-to-5 migration path.
3. Unsupported older databases that contain recognized app tables remain untouched so the existing confirmation gate can preserve or reset them explicitly. They must never be silently stamped as current.

The hotfix will not introduce a generic migration runner, column-evolution framework, production backup integration, or read-only recovery UI. Those remain C-Core Task 1 work.

`resetAppDatabase` will also drop the recovery table before recreating the current schema. This prevents a reset database from retaining a stale read-only marker.

## Tests

Tests will use the existing `node:sqlite` adapter and exercise production database code:

- fresh version-0 database creates Registry and all app-owned tables and records schema version 5;
- fresh initialization is repeatable;
- version-0 database containing legacy app data is not initialized or stamped;
- version-4 migration remains additive and preserves existing rows;
- reset removes a prior recovery diagnostic;
- Workflow Registry can install and activate a builtin-equivalent record immediately after fresh initialization.

The first fresh-install regression test must be observed failing before production code changes and passing afterward.

## Release

The release changes all application versions from 1.4.6 to 1.4.7 and Android `versionCode` from 16 to 17. The hotfix branch is reviewed through a pull request targeting `main`. After the PR is merged and the merged commit is verified on `origin/main`, annotated tag `v1.4.7` is pushed at that commit.

The existing tag workflow must pass version ownership, typecheck, Jest, signed universal APK build, four-ABI inspection, and `apksigner` verification before publishing the GitHub Release. The resulting APK asset and SHA-256 are recorded in the handoff.

## Acceptance criteria

- A clean install opens CreateForm with the builtin H3 workflow available.
- Existing v4 users retain data through the v5 migration.
- Unsupported legacy data is never silently relabeled as v5.
- No repository constructor regains Workflow Registry DDL.
- Typecheck and all Jest suites pass; Android debug/release-relevant build verification succeeds.
- PR is merged to `main`, `v1.4.7` points to the merged main commit, and the GitHub Release contains a verified signed universal APK.
