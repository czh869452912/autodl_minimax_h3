# Workflow release migration emulator verification

## In-place upgrade of the affected emulator

- Device: `emulator-5554` (`test_phone`, Android 15, x86_64)
- Package: `com.example.autodlh3`
- Upgrade: `1.4.9` (`versionCode=19`) to `1.4.10` (`versionCode=20`)
- Install method: Gradle `:app:installDebug` without uninstalling or clearing application data
- Cold launch: `Status: ok`, `LaunchState: COLD`, `TotalTime: 1796 ms`
- Database integrity: `ok`; schema advanced from `6` to `7`
- Local evidence copy: `affected-after.db` (ignored by Git; contains private application data)
- Local evidence SHA-256: `832D81C687ABA0FB1BF3469D7F4AD92479E6AB820C752E7C46A646F32155887F`

### Data preservation and release reconciliation

| Object | Before | After |
| --- | ---: | ---: |
| tasks | 4 | 4 |
| media_assets | 4 | 4 |
| workflow_jobs | 4 | 4 |
| workflow_registry | 1 | 2 |
| workflow_registry_active | 1 | 1 |
| workflow_registry_releases | absent | 1 |
| app_database_recovery | 0 | 0 |

- Historical `autodl.minimax-h3.i2v-15s@1.0.0` remains byte-identical: stored payload SHA-256 and legacy content hash are both `917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390`.
- Active coordinate is `autodl.minimax-h3.i2v-15s@1.0.1` with content hash `fe166625b82f953d23eac160ed509f468b2383b7d7c8be6383abca9096381897`; its active pointer records 1.0.0 as the previous version.
- Release ledger contains `mobile-1.4.10` with manifest hash `93a5882eda1013a0232588ec824d817b8dd63f6317f4ecd08c9c09206b6305c5`.
- Upgrade created both a schema backup (`autodl-h3-v6-to-v7-*.backup.db`) and a release backup (`autodl-h3-release-mobile-1.4.10-*.backup.db`) before mutation.
- `SecureStore.xml` SHA-256 remained `4a85d68e1a7186c985ce313115433df481220ef9ac10fa1a1fd159c38a430cad`.
- All five poster hashes and all five image-picker cache hashes matched the pre-upgrade fingerprints.

The post-upgrade UI showed the workflow title, prompt field, resolution choices, duration control, seed field, and enabled Generate action. The crash buffer was empty, and filtered logcat contained no immutability, registry-integrity, fatal-exception, or application AndroidRuntime errors. Screenshot: `affected-after.png`.

## Clean-install control

- A separate `autodl_clean_api35` AVD was created from the installed Android 15 Google Play x86_64 image, tested, and stopped afterward.
- Fresh install: `1.4.10` (`versionCode=20`); cold launch `Status: ok`, `LaunchState: COLD`, `TotalTime: 1902 ms`.
- Database integrity: `ok`; schema version `7`; no tasks, media, jobs, or recovery diagnostics.
- Registry contains the pinned 1.0.0 and 1.0.1 packages; 1.0.1 is active with no previous pointer, as expected for a first install.
- Release ledger contains the same `mobile-1.4.10` release and manifest hash.
- A release backup was created before first-install reconciliation.
- The same complete workflow form rendered, and the crash buffer was empty. Screenshot: `clean-install.png`.

No task prompts, credentials, tokens, media paths, workflow payload bodies, or private database files are committed as evidence.
