# B.1 Security and Reliability Closure Design

**Date:** 2026-09-01  
**Scope:** Close the six findings from the B-stage overall review before entering C/D.

## Goal

Make workflow submission, provider artifact delivery, remote Registry access, and local Registry persistence enforce their declared trust and reliability boundaries end to end.

## Design

### 1. Submission provenance

`createWorkflowRuntime.validateDraft` and `submit` will require an explicit `WorkflowProvenance` containing workflow id, version, and canonical content hash. A missing provenance is an error; the runtime will never synthesize a hash from the draft. The Create screen continues to read the active Registry record immediately before submit and supplies that record as provenance. No credential, adapter, transport, or job write may occur before the comparison succeeds.

### 2. Provider artifact policy

`ArtifactDownloadPolicy.allowedHosts` becomes fail-closed for provider downloads. The AutoDL manifest will declare its supported public CDN host suffixes. A policy with no non-empty host list is rejected at the media boundary, while local-file reuse remains allowed because it does not perform a network request.

### 3. Unified bounded download

The download path will use one injected, testable network implementation. It will:

1. validate the initial HTTPS URL and host;
2. follow at most three redirects manually, validating every target;
3. attach an `AbortController` covering the complete request and body-read lifetime;
4. stream bytes into the `.part` file and abort as soon as `maxBytes` is exceeded;
5. require a supported response status and MIME before moving the file to its final path;
6. remove the partial path on every failure.

The native downloader will not be used as a second, independently redirecting request. `timeoutMs`, `maxBytes`, `acceptedMimes`, and `allowedHosts` will be passed from adapter manifest through coordinator, queue, media, and download layers.

### 4. Registry network boundary

Registry index, package, and signature requests will use a shared safe-fetch helper. Redirects are manual and capped; every target is checked against the configured HTTPS domain allowlist. The abort timer remains active through complete response-body consumption, not just until response headers arrive. Response size limits apply both to content-length and streamed bytes.

### 5. Versioned local persistence

The application schema will advance to version 5. Registry tables and provenance columns will be created through a repeatable transactional migration, not ad-hoc DDL in the repository constructor. Before migration, the database layer will expose a backup/export hook. Migration failure will persist a read-only recovery/diagnostic state and must not drop user-owned tables or data. Existing schema versions remain readable until their explicit migration succeeds.

### 6. Verification

Each finding gets a regression test that fails against the current implementation before the fix:

- missing runtime provenance is rejected before any side effect;
- empty AutoDL allowlist is rejected;
- a redirect introduced during the actual streamed download cannot escape the allowlist;
- streamed oversize and body timeout abort and clean `.part`;
- Registry redirects and stalled bodies are rejected/timed out;
- schema migration is transactional, repeatable, and enters recovery on failure.

The release gate is `npm run typecheck`, full Jest, a real SQLite migration test, and the existing Android x86_64 build/install/cold-start crash gate.

## Non-goals

- No new remote collaboration backend.
- No redesign of the C/D workflow or project data model.
- No deletion of legacy tables or user data as part of this closure.

