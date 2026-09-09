# Manual signed workflow distribution

The app only requests the official registry when **Settings → 同步工作流** is pressed. Catalog loading, application startup, and task execution never trigger this sync. Installed packages and existing task snapshots remain local. Sync never submits a paid generation request.

## Trust and protocol

The repository is `https://github.com/czh869452912/autodl_minimax_h3`. The app pins an Ed25519 public key in `mobile/src/workflows/registry/remoteConfig.json`; a fetched index cannot replace that key. The index lives at `https://raw.githubusercontent.com/czh869452912/autodl_minimax_h3/workflow-registry/index.json`.

The signed envelope contains `apiVersion: autodl.workflow-registry/v1`, `registryId: autodl-official`, an integer `sequence`, and `entries`. Each entry contains `workflowId`, stable `major.minor.patch` `version`, canonical package `contentHash`, and an exact official hash-addressed package URL. `signature` is a hex Ed25519 signature over UTF-8 sorted-key canonical JSON of the envelope with only `signature` omitted. Package identity uses the existing `workflow-package/without-declared-hash+sorted-json@1` algorithm; declared metadata contentHash is excluded from hashing.

Packages are stored at `packages/<contentHash>.json` on the publication branch. The publisher refuses to overwrite a package path, change an already-published coordinate, remove historical coordinates, sign with a different key, or reuse/decrease an index sequence. The app independently verifies signatures, hashes, coordinates, schema, adapter version, operation and the six supported H3 binding targets. New adapter protocols need an app update. Older compatible installed versions are never selected over a higher installed compatible version. Identical sync is a no-op for activation pointers. If the same or a higher compatible version is already installed, sync preserves the active selection (including a deliberate rollback or an inactive local import); it does not force reactivation. A failed entry preserves its prior installation; valid independent entries can still install.

SecureStore retains the accepted sequence/index digest and the last sync result. The accepted sequence is persisted before installing packages; retries with the same signed index can finish a partial sync. Failed secure-state reads fail closed and are not overwritten. Clearing application storage resets local replay history, so this is not a protection against complete device-state rollback. Requests use HTTPS, omit credentials, reject redirects, and enforce a 15-second deadline and 512 KiB response limit. On platforms without streaming fetch, the size limit is checked immediately after the platform buffers the response.

## Publish a reviewed package

1. Add a new immutable source file at `registry/workflows/<workflowId>/<version>.json`. Do not edit previous coordinates. Set `minAppVersion` for any app feature the package requires.
2. Install the repository's mobile dependencies and run `node --test scripts/publish-workflow-registry.test.mjs`, mobile typecheck and workflow tests.
3. Configure a protected GitHub environment named `workflow-registry`, limited to `main`, with required reviewers. Store the PEM signing key as environment secret `WORKFLOW_REGISTRY_PRIVATE_KEY`. The implementation key is stored only outside this repository at `C:/Users/Administrator/.codex/secrets/autodl-workflow-registry-ed25519.pem`; back it up securely. Never commit or log its contents.
4. Merge reviewed source changes to `main`. Run **Publish signed workflow registry** manually with a sequence greater than the last publication. The workflow publishes only `index.json` and immutable packages to the separate `workflow-registry` branch; source branches are not modified. Do not allow branch force-pushes. The main-only condition must be deliberately updated if the repository's protected default branch differs.
5. In a compatible app, open Settings, press sync, and check the newly installed target. Before the first publication the button reports a fetch failure and builtins remain available.

For an offline publishing rehearsal, provide the private PEM through `WORKFLOW_REGISTRY_PRIVATE_KEY` and run `node scripts/publish-workflow-registry.mjs --output <isolated-directory> --sequence <next-number>`. Seed that directory with the existing publication tree when validating a subsequent release; sequence/coordinate history comes from its signed index. The command writes files only and never pushes. No publication or GitHub secret setup was performed during implementation.

Key rotation requires an app release with an explicitly reviewed new public key and replay-state migration policy. Losing the private key cannot be repaired by changing the remote index.
