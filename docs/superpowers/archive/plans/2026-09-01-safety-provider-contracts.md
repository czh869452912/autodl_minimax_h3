# Safety and Provider Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the two release-blocking security defects and freeze a tested AutoDL/media contract without adding an application server or cloud dependency.

**Architecture:** Keep the existing runtime operational while adding security guards at Android configuration, settings validation, provider serialization, and artifact download boundaries. Media selections remain local URI references until AutoDL submission, where a bounded sequential preparer creates the wrapper's required data URIs. Provider metadata and response fixtures define the compatibility contract that later Workflow Kernel work will compile dynamically.

**Tech Stack:** React Native 0.86, Expo SDK 57, TypeScript 6, Jest 29, Expo FileSystem, Android Gradle Plugin, existing AutoDL adapter and SecureStore settings.

**Spec:** `docs/superpowers/specs/2026-09-01-local-first-workflow-architecture-design.md`

---

## Global constraints

- Do not add an application backend, object-storage dependency, telemetry service, or webhook receiver.
- Production network access is HTTPS-only. Debug may explicitly allow localhost cleartext through the existing debug manifest.
- User-owned API keys remain in Expo SecureStore and must not appear in logs, errors, fixtures, exported data, or commits.
- Git workflow packages and the durable executor are out of scope for this plan; their interfaces must not be pre-implemented here.
- Preserve the current `TaskRecord` and runtime interfaces through compatible optional fields.
- Every production behavior change follows RED → GREEN → REFACTOR and receives a focused commit.
- Never run a live generation submission in CI. Live metadata verification is opt-in and read-only.

## File structure

### New files

- `mobile/src/security/androidConfig.test.ts` — guards release signing, backup, permission, and cleartext configuration.
- `mobile/src/security/urlPolicy.ts` — pure HTTPS/public-host/allowlist validation.
- `mobile/src/security/urlPolicy.test.ts` — URL policy boundary tests.
- `mobile/src/workflows/providers/autodl/metadata.ts` — validates AutoDL workflow metadata needed by the client.
- `mobile/src/workflows/providers/autodl/metadata.test.ts` — fixture and opt-in live metadata tests.
- `mobile/src/workflows/providers/autodl/fixtures/h3-metadata.json` — sanitized official H3 contract fixture.
- `mobile/src/workflows/providers/autodl/prepareInputs.ts` — validates media and serializes local URIs sequentially.
- `mobile/src/workflows/providers/autodl/prepareInputs.test.ts` — media count/MIME/size/order tests.
- `mobile/src/tasks/downloadPolicy.ts` — artifact URL, redirect, header, and downloaded-size policy.
- `mobile/src/tasks/downloadPolicy.test.ts` — hostile URL/redirect/MIME/size tests.

### Modified files

- `.gitignore`
- `mobile/app.json`
- `mobile/android/app/build.gradle`
- `mobile/android/app/src/main/AndroidManifest.xml`
- `mobile/android/app/debug.keystore` — remove tracked project-local debug key.
- `mobile/src/settings/validation.ts`
- `mobile/src/settings/validation.test.ts`
- `mobile/src/tasks/types.ts`
- `mobile/src/create/MediaPicker.ts`
- `mobile/src/create/createForm.test.ts`
- `mobile/src/workflows/providers/autodl/mapping.ts`
- `mobile/src/workflows/providers/autodl/client.ts`
- `mobile/src/workflows/providers/autodl/client.test.ts`
- `mobile/src/workflows/providers/autodl/adapter.ts`
- `mobile/src/workflows/adapters/autodlComfyUi/adapter.test.ts`
- `mobile/src/tasks/download.ts`
- `mobile/src/tasks/download.test.ts`
- `README.md`

---

### Task 1: Enforce Android release security

**Files:**
- Create: `mobile/src/security/androidConfig.test.ts`
- Modify: `mobile/android/app/build.gradle`
- Modify: `mobile/app.json`
- Modify: `mobile/android/app/src/main/AndroidManifest.xml`
- Modify: `.gitignore`
- Delete: `mobile/android/app/debug.keystore`

- [ ] **Step 1: Write the failing configuration guard**

Create `mobile/src/security/androidConfig.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const text = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('release uses external signing credentials and never debug signing', () => {
  const gradle = text('android/app/build.gradle');
  const release = gradle.match(/release\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';
  expect(gradle).toContain('AUTODL_UPLOAD_STORE_FILE');
  expect(gradle).toContain('AUTODL_UPLOAD_STORE_PASSWORD');
  expect(gradle).toContain('AUTODL_UPLOAD_KEY_ALIAS');
  expect(gradle).toContain('AUTODL_UPLOAD_KEY_PASSWORD');
  expect(release).toContain('signingConfig signingConfigs.release');
  expect(release).not.toContain('signingConfigs.debug');
});

test('production disables cleartext, backup, and overlay permission', () => {
  const app = JSON.parse(text('app.json'));
  const manifest = text('android/app/src/main/AndroidManifest.xml');
  expect(app.expo.android.usesCleartextTraffic).toBe(false);
  expect(manifest).toContain('android:usesCleartextTraffic="false"');
  expect(manifest).toContain('android:allowBackup="false"');
  expect(manifest).not.toContain('android.permission.SYSTEM_ALERT_WINDOW');
});
```

- [ ] **Step 2: Run the guard and verify RED**

Run from `mobile`:

```powershell
npm test -- --runInBand src/security/androidConfig.test.ts
```

Expected: FAIL because release uses `signingConfigs.debug`, cleartext and backup are enabled, and the main manifest contains `SYSTEM_ALERT_WINDOW`.

- [ ] **Step 3: Configure external release signing**

Insert the following variable block immediately before the existing `android {` block in `mobile/android/app/build.gradle`:

```groovy
def signingValue = { String propertyName, String environmentName ->
    findProperty(propertyName) ?: System.getenv(environmentName)
}
def releaseStoreFile = signingValue('autodlUploadStoreFile', 'AUTODL_UPLOAD_STORE_FILE')
def releaseStorePassword = signingValue('autodlUploadStorePassword', 'AUTODL_UPLOAD_STORE_PASSWORD')
def releaseKeyAlias = signingValue('autodlUploadKeyAlias', 'AUTODL_UPLOAD_KEY_ALIAS')
def releaseKeyPassword = signingValue('autodlUploadKeyPassword', 'AUTODL_UPLOAD_KEY_PASSWORD')
def releaseSigningConfigured = [releaseStoreFile, releaseStorePassword, releaseKeyAlias, releaseKeyPassword].every { it }

```

Inside the existing `android {}` block, replace the current `signingConfigs { ... }` block with:

```groovy
signingConfigs {
    debug {
        storeFile file('debug.keystore')
        storePassword 'android'
        keyAlias 'androiddebugkey'
        keyPassword 'android'
    }
    release {
        if (releaseSigningConfigured) {
            storeFile file(releaseStoreFile)
            storePassword releaseStorePassword
            keyAlias releaseKeyAlias
            keyPassword releaseKeyPassword
        }
    }
}
```

Inside the same existing block, replace the current `buildTypes { ... }` block with this complete block:

```groovy
buildTypes {
    debug {
        signingConfig signingConfigs.debug
    }
    release {
        signingConfig signingConfigs.release
        def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
        shrinkResources enableShrinkResources.toBoolean()
        minifyEnabled enableMinifyInReleaseBuilds
        proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        def enablePngCrunchInRelease = findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'
        crunchPngs enablePngCrunchInRelease.toBoolean()
    }
}
```

gradle.taskGraph.whenReady { graph ->
    def releaseRequested = graph.allTasks.any { it.name.toLowerCase().contains('release') }
    if (releaseRequested && !releaseSigningConfigured) {
        throw new GradleException('Release signing requires AUTODL_UPLOAD_STORE_FILE, AUTODL_UPLOAD_STORE_PASSWORD, AUTODL_UPLOAD_KEY_ALIAS, and AUTODL_UPLOAD_KEY_PASSWORD')
    }
}
```

Keep the existing `android {}` block; insert the variables above it and replace only its `signingConfigs`/`buildTypes` sections. Remove `mobile/android/app/debug.keystore` and append this exact rule to `.gitignore`:

```gitignore
mobile/android/app/debug.keystore
```

- [ ] **Step 4: Disable production cleartext, Android backup, and overlay permission**

Set `mobile/app.json`:

```json
"usesCleartextTraffic": false
```

Remove the `SYSTEM_ALERT_WINDOW` permission from the main manifest and configure its application element with:

```xml
android:allowBackup="false"
android:usesCleartextTraffic="false"
```

Do not modify `mobile/android/app/src/debug/AndroidManifest.xml`; its explicit cleartext/overlay overrides remain debug-only.

- [ ] **Step 5: Verify GREEN and Gradle failure behavior**

Run:

```powershell
npm test -- --runInBand src/security/androidConfig.test.ts
cd android
.\gradlew.bat :app:signingReport
cd ..
```

Expected: Jest PASS. `signingReport` lists the default debug key and does not expose release passwords. If Java is unavailable, record that environment blocker verbatim and do not claim Gradle verification.

- [ ] **Step 6: Commit**

```powershell
git add .gitignore mobile/app.json mobile/android/app/build.gradle mobile/android/app/src/main/AndroidManifest.xml mobile/src/security/androidConfig.test.ts
git add -u mobile/android/app/debug.keystore
git commit -m "fix: harden Android release configuration"
```

---

### Task 2: Centralize HTTPS and public-host validation

**Files:**
- Create: `mobile/src/security/urlPolicy.ts`
- Create: `mobile/src/security/urlPolicy.test.ts`
- Modify: `mobile/src/settings/validation.ts`
- Modify: `mobile/src/settings/validation.test.ts`

- [ ] **Step 1: Write failing URL-policy and settings tests**

Create `mobile/src/security/urlPolicy.test.ts`:

```ts
import { assertSafeHttpsUrl } from './urlPolicy';

test.each([
  'http://api.example.test/v1',
  'https://localhost/v1',
  'https://127.0.0.1/v1',
  'https://10.0.0.8/v1',
  'https://172.16.0.8/v1',
  'https://192.168.1.8/v1',
  'https://169.254.1.1/v1',
  'https://[::1]/v1',
  'https://user:password@example.test/v1',
])('rejects unsafe production URL %s', (value) => {
  expect(() => assertSafeHttpsUrl(value)).toThrow();
});

test('accepts a public HTTPS endpoint and enforces an optional host allowlist', () => {
  expect(assertSafeHttpsUrl('https://api.example.test/v1')).toBe('https://api.example.test/v1');
  expect(() => assertSafeHttpsUrl('https://cdn.other.test/file', { allowedHosts: ['example.test'] })).toThrow('域名不在允许列表');
  expect(assertSafeHttpsUrl('https://cdn.example.test/file', { allowedHosts: ['example.test'] })).toBe('https://cdn.example.test/file');
});
```

Add to `mobile/src/settings/validation.test.ts`:

```ts
it('rejects cleartext and local-network LLM endpoints in production', () => {
  for (const llmEndpoint of ['http://api.example.test/v1', 'https://localhost/v1', 'https://192.168.1.2/v1']) {
    expect(() => prepareSettingsForSave({ ...validSettings, llmEndpoint })).toThrow('LLM API 地址必须使用安全的公网 HTTPS 地址');
  }
});

it('allows an explicit localhost exception only for debug tooling', () => {
  expect(prepareSettingsForSave(
    { ...validSettings, llmEndpoint: 'http://localhost:11434/v1' },
    { allowInsecureLocalhost: true },
  ).llmEndpoint).toBe('http://localhost:11434/v1');
});
```

Define `validSettings` once at the top of the existing settings test file using the currently valid HTTPS fixture and numeric controls.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- --runInBand src/security/urlPolicy.test.ts src/settings/validation.test.ts
```

Expected: FAIL because `assertSafeHttpsUrl` does not exist and current settings accept HTTP.

- [ ] **Step 3: Implement the pure policy**

Create `mobile/src/security/urlPolicy.ts`:

```ts
export type UrlPolicy = { allowedHosts?: string[]; allowInsecureLocalhost?: boolean };

function isIpv4(host: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function isPrivateIpv4(host: string): boolean {
  if (!isIpv4(host)) return false;
  const [a, b] = host.split('.').map(Number);
  return a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
}

function isLocalHost(host: string): boolean {
  const value = host.toLowerCase().replace(/^\[|\]$/g, '');
  return value === 'localhost' || value.endsWith('.localhost') || value.endsWith('.local') ||
    value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:') || isPrivateIpv4(value);
}

function allowed(host: string, entries: string[]): boolean {
  const value = host.toLowerCase();
  return entries.some((entry) => value === entry.toLowerCase() || value.endsWith(`.${entry.toLowerCase()}`));
}

export function assertSafeHttpsUrl(raw: string, policy: UrlPolicy = {}): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('URL 格式无效'); }
  const localDebug = policy.allowInsecureLocalhost && isLocalHost(url.hostname);
  if (url.protocol !== 'https:' && !(localDebug && url.protocol === 'http:')) throw new Error('必须使用 HTTPS');
  if (url.username || url.password) throw new Error('URL 不能包含凭据');
  if (isLocalHost(url.hostname) && !localDebug) throw new Error('不允许访问本机或私有网络地址');
  if (policy.allowedHosts?.length && !allowed(url.hostname, policy.allowedHosts)) throw new Error('域名不在允许列表');
  return url.toString().replace(/\/$/, raw.endsWith('/') ? '/' : '');
}
```

- [ ] **Step 4: Reuse the policy in settings validation**

Replace `prepareSettingsForSave` in `mobile/src/settings/validation.ts` with this complete implementation and add the policy import:

```ts
import { assertSafeHttpsUrl } from '../security/urlPolicy';

export function prepareSettingsForSave(
  values: AppSettings,
  options: { allowInsecureLocalhost?: boolean } = {},
): AppSettings {
  const normalized: AppSettings = {
    token: values.token.trim(),
    llmEndpoint: values.llmEndpoint.trim(),
    llmModel: values.llmModel.trim(),
    llmApiKey: values.llmApiKey.trim(),
    llmTimeoutSeconds: values.llmTimeoutSeconds.trim(),
    llmMaxRetries: values.llmMaxRetries.trim(),
    autoExportToGallery: values.autoExportToGallery,
    keepPrivateCopy: values.keepPrivateCopy,
  };
  if (normalized.llmEndpoint) {
    try {
      normalized.llmEndpoint = assertSafeHttpsUrl(normalized.llmEndpoint, options).replace(/\/$/, '');
    } catch {
      throw new Error('LLM API 地址必须使用安全的公网 HTTPS 地址');
    }
  }
  const timeout = Number(normalized.llmTimeoutSeconds);
  if (!Number.isInteger(timeout) || timeout < 30 || timeout > 3600) {
    throw new Error('LLM 请求超时必须是 30–3600 秒之间的整数');
  }
  const retries = Number(normalized.llmMaxRetries);
  if (!Number.isInteger(retries) || retries < 0 || retries > 5) {
    throw new Error('LLM 最大重试次数必须是 0–5 之间的整数');
  }
  return normalized;
}
```

When `allowInsecureLocalhost` is true, `assertSafeHttpsUrl` accepts only localhost/loopback HTTP; private LAN ranges remain rejected. Production callers keep the default empty options object.

- [ ] **Step 5: Verify GREEN and type safety**

```powershell
npm test -- --runInBand src/security/urlPolicy.test.ts src/settings/validation.test.ts src/route-tests/settings.test.tsx
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add mobile/src/security mobile/src/settings/validation.ts mobile/src/settings/validation.test.ts
git commit -m "fix: enforce secure provider endpoints"
```

---

### Task 3: Freeze AutoDL field and status compatibility

**Files:**
- Create: `mobile/src/workflows/providers/autodl/mapping.test.ts`
- Modify: `mobile/src/workflows/providers/autodl/mapping.ts`
- Modify: `mobile/src/create/createForm.test.ts`
- Modify: `mobile/src/workflows/adapters/autodlComfyUi/adapter.test.ts`

- [ ] **Step 1: Write regression tests for the observed contract**

Create `mobile/src/workflows/providers/autodl/mapping.test.ts`:

```ts
import { buildAutodlSubmitRequest, normalizeAutodlStatus, parseAutodlResult } from './mapping';

test('maps H3 reference slots from zero exactly as provider metadata declares', () => {
  const payload = buildAutodlSubmitRequest({
    prompt: 'p', resolution: '768p竖', duration: 15,
    images: [{ dataUri: 'data:image/png;base64,AA==', mime: 'image/png' }],
    audios: [{ dataUri: 'data:audio/mpeg;base64,AA==', mime: 'audio/mpeg' }],
  });
  expect(payload.ref_image_0).toBe('data:image/png;base64,AA==');
  expect(payload.ref_audio_0).toBe('data:audio/mpeg;base64,AA==');
  expect(payload).not.toHaveProperty('ref_image_9');
  expect(payload).not.toHaveProperty('ref_audio_3');
});

test.each(['SUCCESS', 'SUCCEEDED', 'successful', 'completed', 'COMPLETE'])(
  'normalizes terminal success %s',
  (status) => expect(normalizeAutodlStatus(status)).toBe('SUCCEEDED'),
);

test('extracts only declared result entries and rejects placeholders', () => {
  expect(parseAutodlResult({ results: [{ url: 'https://cdn.example.test/video.mp4', type: 'video', file_type: 'mp4' }] })[0]).toMatchObject({
    uri: 'https://cdn.example.test/video.mp4', kind: 'video', mime: 'video/mp4',
  });
  expect(parseAutodlResult({ results: [{ url: 'https://', type: 'video' }], debug_url: 'https://internal.example.test/' })).toEqual([]);
});
```

Update the existing count assertion in `mobile/src/create/createForm.test.ts` to additionally require keys `ref_image_0`, `ref_image_8`, `ref_audio_0`, and `ref_audio_2`.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- --runInBand src/workflows/providers/autodl/mapping.test.ts src/create/createForm.test.ts src/workflows/adapters/autodlComfyUi/adapter.test.ts
```

Expected: FAIL because mapping is 1-based, `completed` is queued, and recursive result scanning accepts unrelated URLs.

- [ ] **Step 3: Implement exact serialization and status normalization**

Change the two slot bindings in `mapping.ts` to:

```ts
input.images?.slice(0, 9).forEach((item, index) => {
  if (item.dataUri) payload[`ref_image_${index}`] = item.dataUri;
});
input.audios?.slice(0, 3).forEach((item, index) => {
  if (item.dataUri) payload[`ref_audio_${index}`] = item.dataUri;
});
```

Include `COMPLETED` and `COMPLETE` in the success branch. Replace recursive URL discovery with parsing of only `data.results` or a directly supplied result array. A result item is accepted only when `new URL(url)` succeeds, protocol is HTTPS, and host/path are non-empty. Preserve provider IDs, declared type/file_type, duplicate handling, and current artifact output shape.

- [ ] **Step 4: Verify GREEN**

```powershell
npm test -- --runInBand src/workflows/providers/autodl/mapping.test.ts src/create/createForm.test.ts src/workflows/adapters/autodlComfyUi/adapter.test.ts src/workflows/providers/autodl/client.test.ts
npm run typecheck
```

Expected: all focused tests and typecheck exit 0.

- [ ] **Step 5: Commit**

```powershell
git add mobile/src/workflows/providers/autodl/mapping.ts mobile/src/workflows/providers/autodl/mapping.test.ts mobile/src/create/createForm.test.ts mobile/src/workflows/adapters/autodlComfyUi/adapter.test.ts
git commit -m "fix: align AutoDL H3 provider contract"
```

---

### Task 4: Add validated AutoDL metadata fixtures and opt-in live verification

**Files:**
- Create: `mobile/src/workflows/providers/autodl/metadata.ts`
- Create: `mobile/src/workflows/providers/autodl/metadata.test.ts`
- Create: `mobile/src/workflows/providers/autodl/fixtures/h3-metadata.json`
- Modify: `mobile/src/workflows/providers/autodl/client.ts`
- Modify: `mobile/src/workflows/providers/autodl/client.test.ts`

- [ ] **Step 1: Add the sanitized fixture and failing parser tests**

Create `fixtures/h3-metadata.json` containing only the stable public contract:

```json
{
  "workflow_id": "minimax_h3_image_audio_to_video_v2_15s",
  "input_rules": {
    "duration": { "type": "integer", "minimum": 1, "maximum": 15 },
    "prompt": { "type": "string", "min_length": 1, "max_length": 10000 },
    "seed": { "type": "integer", "minimum": 1, "maximum": 999999999999999 },
    "ref_image_0": { "accept_types": ["image/jpeg", "image/png", "image/webp"] },
    "ref_image_8": { "accept_types": ["image/jpeg", "image/png", "image/webp"] },
    "ref_audio_0": { "accept_types": ["audio/mpeg", "audio/wav", "audio/mp4", "audio/flac"] },
    "ref_audio_2": { "accept_types": ["audio/mpeg", "audio/wav", "audio/mp4", "audio/flac"] }
  },
  "output_example": {
    "data": { "status": "completed", "results": [{ "url": "https://cdn.example.test/result.mp4", "type": "video", "file_type": "mp4" }] }
  }
}
```

Create `metadata.test.ts`:

```ts
import fixture from './fixtures/h3-metadata.json';
import { parseAutodlWorkflowMetadata, fetchAutodlWorkflowMetadata } from './metadata';

test('accepts the stable H3 slot/range/MIME contract', () => {
  const metadata = parseAutodlWorkflowMetadata(fixture);
  expect(metadata.workflowId).toBe('minimax_h3_image_audio_to_video_v2_15s');
  expect(metadata.inputRules.ref_image_0.acceptTypes).toContain('image/webp');
  expect(metadata.inputRules.ref_audio_2.acceptTypes).toContain('audio/flac');
});

test('rejects metadata that removes the zero slot or changes duration bounds', () => {
  expect(() => parseAutodlWorkflowMetadata({ ...fixture, input_rules: { ...fixture.input_rules, ref_image_0: undefined } })).toThrow('ref_image_0');
  expect(() => parseAutodlWorkflowMetadata({ ...fixture, input_rules: { ...fixture.input_rules, duration: { type: 'integer', minimum: 1, maximum: 30 } } })).toThrow('duration');
});

const liveTest = process.env.AUTODL_CONTRACT_LIVE === '1' ? test : test.skip;
liveTest('matches the public live H3 metadata contract', async () => {
  const value = await fetchAutodlWorkflowMetadata({ transport: fetch });
  expect(value.inputRules.ref_image_0.acceptTypes).toContain('image/png');
  expect(value.inputRules.ref_audio_2.acceptTypes).toContain('audio/wav');
});
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- --runInBand src/workflows/providers/autodl/metadata.test.ts
```

Expected: FAIL because the metadata module does not exist.

- [ ] **Step 3: Implement strict metadata parsing and fetching**

Create `metadata.ts` with this public surface:

```ts
import type { HttpTransport } from '../../../providers/httpTransport';

export const H3_WORKFLOW_ID = 'minimax_h3_image_audio_to_video_v2_15s';
export const H3_METADATA_URL = `https://www.autodl.art/api/v1/comfyui/workflows/${H3_WORKFLOW_ID}`;

export type AutodlInputRule = {
  type?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  acceptTypes: string[];
};
export type AutodlWorkflowMetadata = {
  workflowId: string;
  inputRules: Record<string, AutodlInputRule>;
};

export function parseAutodlWorkflowMetadata(value: unknown): AutodlWorkflowMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('metadata must be an object');
  const source = value as Record<string, unknown>;
  if (source.workflow_id !== H3_WORKFLOW_ID) throw new Error(`workflow_id must be ${H3_WORKFLOW_ID}`);
  const rules = source.input_rules;
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) throw new Error('input_rules is required');
  const inputRules = rules as Record<string, unknown>;
  for (const key of ['ref_image_0', 'ref_image_8', 'ref_audio_0', 'ref_audio_2']) {
    const rule = inputRules[key];
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error(`${key} rule is required`);
    const acceptTypes = (rule as Record<string, unknown>).accept_types;
    if (!Array.isArray(acceptTypes) || acceptTypes.length === 0 || acceptTypes.some((item) => typeof item !== 'string' || !item.includes('/'))) throw new Error(`${key}.accept_types is invalid`);
  }
  const duration = inputRules.duration as Record<string, unknown> | undefined;
  if (!duration || duration.type !== 'integer' || duration.minimum !== 1 || duration.maximum !== 15) throw new Error('duration contract is invalid');
  const prompt = inputRules.prompt as Record<string, unknown> | undefined;
  if (!prompt || prompt.type !== 'string' || prompt.min_length !== 1 || prompt.max_length !== 10000) throw new Error('prompt contract is invalid');
  const seed = inputRules.seed as Record<string, unknown> | undefined;
  if (!seed || seed.type !== 'integer' || typeof seed.minimum !== 'number' || typeof seed.maximum !== 'number') throw new Error('seed contract is invalid');
  const normalize = (rule: Record<string, unknown>): AutodlInputRule => ({
    type: typeof rule.type === 'string' ? rule.type : undefined,
    minimum: typeof rule.minimum === 'number' ? rule.minimum : undefined,
    maximum: typeof rule.maximum === 'number' ? rule.maximum : undefined,
    minLength: typeof rule.min_length === 'number' ? rule.min_length : undefined,
    maxLength: typeof rule.max_length === 'number' ? rule.max_length : undefined,
    acceptTypes: Array.isArray(rule.accept_types) ? rule.accept_types.filter((item): item is string => typeof item === 'string') : [],
  });
  return { workflowId: H3_WORKFLOW_ID, inputRules: Object.fromEntries(Object.entries(inputRules).filter(([, rule]) => rule && typeof rule === 'object' && !Array.isArray(rule)).map(([key, rule]) => [key, normalize(rule as Record<string, unknown>)])) };
}

export async function fetchAutodlWorkflowMetadata({
  transport, url = H3_METADATA_URL, timeoutMs = 15_000,
}: { transport: HttpTransport; url?: string; timeoutMs?: number }): Promise<AutodlWorkflowMetadata> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await transport(url, { method: 'GET', signal: controller.signal });
  } catch (error) {
    throw new Error(controller.signal.aborted ? 'AutoDL metadata request timed out' : `AutoDL metadata request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`AutoDL metadata request failed (HTTP ${response.status})`);
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error('AutoDL metadata response is not valid JSON'); }
  return parseAutodlWorkflowMetadata(body);
}
```

Expand the parser body directly in the implementation; do not leave the comments as placeholders. Re-export `H3_WORKFLOW_ID` from metadata in `client.ts` instead of declaring a second constant.

- [ ] **Step 4: Add client error tests for metadata HTTP/timeout failures**

Extend `metadata.test.ts` using injected `transport` responses to assert non-2xx and invalid JSON reject with field-specific, credential-free messages. Never include Authorization in this public GET.

- [ ] **Step 5: Verify fixture and live modes**

```powershell
npm test -- --runInBand src/workflows/providers/autodl/metadata.test.ts src/workflows/providers/autodl/client.test.ts
$env:AUTODL_CONTRACT_LIVE='1'
npm test -- --runInBand src/workflows/providers/autodl/metadata.test.ts
Remove-Item Env:AUTODL_CONTRACT_LIVE
```

Expected: fixture tests PASS. The live test either PASSes or reports the exact upstream contract drift; upstream drift is not fixed by weakening the fixture assertion.

- [ ] **Step 6: Commit**

```powershell
git add mobile/src/workflows/providers/autodl/metadata.ts mobile/src/workflows/providers/autodl/metadata.test.ts mobile/src/workflows/providers/autodl/fixtures/h3-metadata.json mobile/src/workflows/providers/autodl/client.ts mobile/src/workflows/providers/autodl/client.test.ts
git commit -m "test: freeze AutoDL workflow metadata contract"
```

---

### Task 5: Keep media local until bounded provider preparation

**Files:**
- Create: `mobile/src/workflows/providers/autodl/prepareInputs.ts`
- Create: `mobile/src/workflows/providers/autodl/prepareInputs.test.ts`
- Modify: `mobile/src/tasks/types.ts`
- Modify: `mobile/src/create/MediaPicker.ts`
- Modify: `mobile/src/create/createForm.test.ts`
- Modify: `mobile/src/workflows/providers/autodl/adapter.ts`
- Modify: `mobile/src/workflows/adapters/autodlComfyUi/adapter.test.ts`

- [ ] **Step 1: Write failing media-preparation tests**

Create `prepareInputs.test.ts`:

```ts
import { prepareAutodlInput } from './prepareInputs';

test('reads local media sequentially and preserves zero-based order', async () => {
  let concurrent = 0;
  let peak = 0;
  const readBase64 = jest.fn(async (uri: string) => {
    concurrent += 1; peak = Math.max(peak, concurrent);
    await Promise.resolve();
    concurrent -= 1;
    return uri.endsWith('1.png') ? 'AQ==' : 'Ag==';
  });
  const result = await prepareAutodlInput({
    prompt: 'p', resolution: '768p竖', duration: 5,
    images: [
      { uri: 'file:///1.png', name: '1.png', mime: 'image/png', size: 1 },
      { uri: 'file:///2.png', name: '2.png', mime: 'image/png', size: 1 },
    ],
  }, { readBase64 });
  expect(peak).toBe(1);
  expect(result.images?.map((item) => item.dataUri)).toEqual([
    'data:image/png;base64,AQ==', 'data:image/png;base64,Ag==',
  ]);
});

test('rejects unsupported MIME, too many references, and aggregate byte overflow before reading', async () => {
  const readBase64 = jest.fn();
  await expect(prepareAutodlInput({ prompt: 'p', resolution: '768p竖', duration: 5, images: [{ uri: 'file:///x.svg', mime: 'image/svg+xml', size: 1 }] }, { readBase64 })).rejects.toThrow('不支持的图片格式');
  await expect(prepareAutodlInput({ prompt: 'p', resolution: '768p竖', duration: 5, images: Array.from({ length: 10 }, (_, i) => ({ uri: `file:///${i}.png`, mime: 'image/png', size: 1 })) }, { readBase64 })).rejects.toThrow('最多 9 张');
  await expect(prepareAutodlInput({ prompt: 'p', resolution: '768p竖', duration: 5, audios: [{ uri: 'file:///x.wav', mime: 'audio/wav', size: 51 * 1024 * 1024 }] }, { readBase64, maxRawBytes: 50 * 1024 * 1024 })).rejects.toThrow('总大小');
  expect(readBase64).not.toHaveBeenCalled();
});
```

Add a CreateForm contract test proving `pickTaskMedia` returns URI metadata and does not call `FileSystem.readAsStringAsync` during selection.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- --runInBand src/workflows/providers/autodl/prepareInputs.test.ts src/create/createForm.test.ts src/workflows/adapters/autodlComfyUi/adapter.test.ts
```

Expected: FAIL because media is currently converted with `Promise.all` in the picker and no preparer exists.

- [ ] **Step 3: Extend the compatible media reference type**

Change `TaskMediaInput` to:

```ts
export interface TaskMediaInput {
  uri?: string;
  dataUri?: string;
  name?: string;
  mime?: string;
  size?: number;
  sha256?: string;
}
```

Change `MediaPicker.ts` to validate selected count and per-file metadata, then return `{ uri, name, mime, size }`. Remove picker-time Base64 reads and `Promise.all`. Preserve existing file/gallery MIME defaults.

- [ ] **Step 4: Implement bounded AutoDL preparation**

Create `prepareInputs.ts` with:

```ts
import * as FileSystem from 'expo-file-system/legacy';
import type { TaskMediaInput } from '../../../tasks/types';
import type { AutodlInput } from './mapping';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUDIO_MIMES = new Set(['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/flac']);
export const DEFAULT_AUTODL_RAW_MEDIA_BYTES = 50 * 1024 * 1024;

type Dependencies = {
  readBase64: (uri: string) => Promise<string>;
  maxRawBytes: number;
};

const defaultRead = (uri: string) => FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });

export async function prepareAutodlInput(
  input: AutodlInput,
  deps: Partial<Dependencies> = {},
): Promise<AutodlInput> {
  const readBase64 = deps.readBase64 ?? defaultRead;
  const maxRawBytes = deps.maxRawBytes ?? DEFAULT_AUTODL_RAW_MEDIA_BYTES;
  const images = input.images ?? [];
  const audios = input.audios ?? [];
  if (images.length > 9) throw new Error('最多 9 张图片');
  if (audios.length > 3) throw new Error('最多 3 个音频');
  const totalBytes = [...images, ...audios].reduce((sum, item) => sum + (item.size ?? 0), 0);
  if (totalBytes > maxRawBytes) throw new Error('总大小超过 AutoDL 输入限制');
  const encode = async (item: TaskMediaInput, kind: 'image' | 'audio'): Promise<TaskMediaInput> => {
    const accepted = kind === 'image' ? IMAGE_MIMES : AUDIO_MIMES;
    if (!item.mime || !accepted.has(item.mime)) throw new Error(`不支持的${kind === 'image' ? '图片' : '音频'}格式`);
    if (item.dataUri) {
      if (!new RegExp(`^data:${item.mime.replace('/', '\\/')};base64,[A-Za-z0-9+/=]+$`, 'i').test(item.dataUri)) throw new Error('媒体 data URI 格式无效');
      return { ...item };
    }
    if (!item.uri) throw new Error('媒体缺少本地 URI');
    const encoded = await readBase64(item.uri);
    if (!/^[A-Za-z0-9+/=]+$/.test(encoded)) throw new Error('媒体 Base64 格式无效');
    return { ...item, dataUri: `data:${item.mime};base64,${encoded}` };
  };
  const preparedImages: TaskMediaInput[] = [];
  for (const item of images) preparedImages.push(await encode(item, 'image'));
  const preparedAudios: TaskMediaInput[] = [];
  for (const item of audios) preparedAudios.push(await encode(item, 'audio'));
  return { ...input, images: preparedImages, audios: preparedAudios };
}
```

Return cloned arrays and never mutate the draft. Keep the 50 MB value as a conservative provider/UI compatibility limit, not as a claim that every AutoDL API accepts 50 MB per file.

- [ ] **Step 5: Prepare inside the adapter immediately before submit**

Extend adapter dependencies with an optional `readBase64` and call:

```ts
const prepared = await prepareAutodlInput(input, { readBase64: deps.readBase64 });
const data = await client.submit(prepared, target.workflowId);
```

The client remains pure HTTP and receives no file URI. Update adapter tests to prove submit payload contains `ref_image_0` and that preparation errors make zero transport calls.

- [ ] **Step 6: Verify GREEN**

```powershell
npm test -- --runInBand src/workflows/providers/autodl/prepareInputs.test.ts src/create/createForm.test.ts src/workflows/adapters/autodlComfyUi/adapter.test.ts src/workflows/providers/autodl/client.test.ts
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```powershell
git add mobile/src/tasks/types.ts mobile/src/create/MediaPicker.ts mobile/src/create/createForm.test.ts mobile/src/workflows/providers/autodl/prepareInputs.ts mobile/src/workflows/providers/autodl/prepareInputs.test.ts mobile/src/workflows/providers/autodl/adapter.ts mobile/src/workflows/adapters/autodlComfyUi/adapter.test.ts
git commit -m "refactor: defer bounded AutoDL media preparation"
```

---

### Task 6: Validate artifact URLs and downloaded content

**Files:**
- Create: `mobile/src/tasks/downloadPolicy.ts`
- Create: `mobile/src/tasks/downloadPolicy.test.ts`
- Modify: `mobile/src/tasks/download.ts`
- Modify: `mobile/src/tasks/download.test.ts`

- [ ] **Step 1: Write failing policy tests**

Create `downloadPolicy.test.ts`:

```ts
import { validateArtifactUrl, validateDownloadResult } from './downloadPolicy';

test.each([
  'http://cdn.example.test/video.mp4',
  'https://localhost/video.mp4',
  'https://127.0.0.1/video.mp4',
  'https://192.168.1.2/video.mp4',
  'file:///private/video.mp4',
])('rejects unsafe artifact URL %s', (url) => {
  expect(() => validateArtifactUrl(url)).toThrow();
});

test('enforces an adapter-provided artifact host list', () => {
  expect(validateArtifactUrl('https://cdn.example.test/video.mp4', ['example.test'])).toBe('https://cdn.example.test/video.mp4');
  expect(() => validateArtifactUrl('https://cdn.other.test/video.mp4', ['example.test'])).toThrow('域名不在允许列表');
});

test('rejects non-video, non-success, and oversized downloads', () => {
  expect(() => validateDownloadResult({ status: 500, headers: {}, size: 10 }, { maxBytes: 100 })).toThrow('HTTP 500');
  expect(() => validateDownloadResult({ status: 200, headers: { 'content-type': 'text/html' }, size: 10 }, { maxBytes: 100 })).toThrow('媒体类型');
  expect(() => validateDownloadResult({ status: 200, headers: { 'content-type': 'video/mp4' }, size: 101 }, { maxBytes: 100 })).toThrow('大小');
});
```

Extend `download.test.ts` by mocking `expo-file-system/legacy` and proving an unsafe URL fails before `downloadAsync`, a bad content type deletes `.part`, and a valid video is moved atomically.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- --runInBand src/tasks/downloadPolicy.test.ts src/tasks/download.test.ts
```

Expected: FAIL because URL/content policy does not exist and current code downloads arbitrary HTTP(S) URLs directly.

- [ ] **Step 3: Implement pure download policy**

Create `downloadPolicy.ts`:

```ts
import { assertSafeHttpsUrl } from '../security/urlPolicy';

export const DEFAULT_VIDEO_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export function validateArtifactUrl(url: string, allowedHosts?: string[]): string {
  return assertSafeHttpsUrl(url, { allowedHosts });
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1];
}

export function validateDownloadResult(
  result: { status: number; headers: Record<string, string>; size: number },
  options: { maxBytes?: number; acceptedMimes?: string[] } = {},
): void {
  const maxBytes = options.maxBytes ?? DEFAULT_VIDEO_DOWNLOAD_BYTES;
  const accepted = options.acceptedMimes ?? ['video/mp4', 'video/webm', 'video/quicktime'];
  if (result.status < 200 || result.status >= 300) throw new Error(`下载失败（HTTP ${result.status}）`);
  if (!Number.isFinite(result.size) || result.size < 0 || result.size > maxBytes) throw new Error('下载文件大小超过限制');
  const mime = header(result.headers, 'content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (mime && !accepted.includes(mime)) throw new Error(`下载媒体类型不受支持：${mime}`);
}
```

An absent Content-Type is tolerated only because existing providers may omit it; extension/poster extraction remains a secondary check. Task C will move this policy to normalized Artifact capabilities and require adapter host rules.

- [ ] **Step 4: Apply policy before and after download**

Extend `downloadTask` options with:

```ts
type DownloadOptions = {
  onUpdate?: (patch: Partial<TaskRecord>) => Promise<void>;
  allowedHosts?: string[];
  maxBytes?: number;
};
```

Before filesystem mutation call `validateArtifactUrl(task.videoUrl, options.allowedHosts)`. After `downloadAsync`, call `getInfoAsync(result.uri)` and pass `result.status`, `result.headers`, and actual `info.size` to `validateDownloadResult`. Delete `.part` in both policy and network failures. Move to the final target only after validation succeeds.

- [ ] **Step 5: Verify GREEN**

```powershell
npm test -- --runInBand src/tasks/downloadPolicy.test.ts src/tasks/download.test.ts src/tasks/media.test.ts src/tasks/coordinator.test.ts
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add mobile/src/tasks/downloadPolicy.ts mobile/src/tasks/downloadPolicy.test.ts mobile/src/tasks/download.ts mobile/src/tasks/download.test.ts
git commit -m "fix: validate provider artifact downloads"
```

---

### Task 7: Document release and provider verification procedures

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add concrete local-only operational documentation**

Add sections covering:

```text
Release signing environment variables:
AUTODL_UPLOAD_STORE_FILE
AUTODL_UPLOAD_STORE_PASSWORD
AUTODL_UPLOAD_KEY_ALIAS
AUTODL_UPLOAD_KEY_PASSWORD

Live read-only contract verification:
$env:AUTODL_CONTRACT_LIVE='1'
npm test -- --runInBand src/workflows/providers/autodl/metadata.test.ts
Remove-Item Env:AUTODL_CONTRACT_LIVE
```

State explicitly that the app has no application backend, production endpoints require public HTTPS, Git workflow subscriptions are declarative/signed only, and no generation request runs in the metadata test.

- [ ] **Step 2: Run documentation consistency checks**

```powershell
rg -n "usesCleartextTraffic|signingConfigs.debug|50MB|50 MB|外部服务器|云端" README.md mobile/app.json mobile/android/app/build.gradle mobile/src
git diff --check
```

Expected: no README claim says every media file may be 50 MB; production config has no debug release signing or cleartext enablement.

- [ ] **Step 3: Commit**

```powershell
git add README.md
git commit -m "docs: describe secure local-only provider setup"
```

---

### Task 8: Full A-phase verification

**Files:**
- No production changes unless verification exposes a tested defect.

- [ ] **Step 1: Run the complete JavaScript verification suite**

```powershell
cd mobile
npm run typecheck
npm test -- --runInBand
```

Expected: typecheck exits 0; Jest reports zero failed suites and zero failed tests.

- [ ] **Step 2: Run Android configuration/build verification**

Without release secrets, verify debug:

```powershell
cd android
.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
```

With a disposable test keystore supplied only through environment variables, verify release signing configuration:

```powershell
.\gradlew.bat :app:validateSigningRelease
```

Expected: commands exit 0 in a Java/Android SDK environment. If Java or SDK is missing, capture the exact output as an environment limitation and do not claim Android build success.

- [ ] **Step 3: Inspect repository hygiene**

```powershell
cd ..\..
git diff --check
git status --short
git ls-files mobile/android/app/debug.keystore
rg -n "AUTODL_UPLOAD_STORE_PASSWORD\s*=|AUTODL_UPLOAD_KEY_PASSWORD\s*=|Authorization:\s*['\"]" . --glob '!mobile/package-lock.json'
```

Expected: `git diff --check` is clean; debug keystore is not tracked; no credential values were added; pre-existing untracked `local.properties` remains untouched.

- [ ] **Step 4: Review A-phase acceptance criteria**

Confirm with evidence:

- Release cannot use debug signing.
- Production rejects cleartext and private-network endpoints.
- AutoDL uses zero-based media slots and recognizes `completed`.
- Provider response parsing ignores unrelated/placeholder URLs.
- Media Base64 conversion occurs only at submit time and sequentially.
- Unsafe or oversized artifact downloads fail before final-file publication.
- Fixture tests run offline; live metadata verification is opt-in and read-only.

- [ ] **Step 5: Commit verification-only corrections if necessary**

If verification required a code correction, reproduce it with a failing test, apply the minimal fix, rerun the focused and full commands, and commit with a behavior-specific message. Do not create an empty verification commit.
