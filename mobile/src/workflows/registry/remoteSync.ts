import { canonicalizeDefinition } from './canonicalize';
import { verifyEd25519 } from './crypto';
import { sha256Hex } from './hash';
import { canonicalizePackage, isWorkflowCompatible, parseVerifiedWorkflowPackage } from './packageVerification';
import { validateWorkflowDefinition } from '../schema/validator';
import { compareVersions } from './semver';
import { registryRecordToDefinition } from './catalog';
import { WORKFLOW_PACKAGE_IDENTITY_V1 } from './identity';
import type { WorkflowRegistry } from './types';
import type { WorkflowPackage } from '../schema/package';

export const REMOTE_BASE = 'https://raw.githubusercontent.com/czh869452912/autodl_minimax_h3/workflow-registry';
export const REMOTE_INDEX = `${REMOTE_BASE}/index.json`;
export type RemoteSyncResult = { at: number; status: 'success' | 'partial' | 'failed'; installed: number; skipped: number; errors: string[] };
export type RemoteSyncState = { sequence?: number; indexHash?: string; result?: RemoteSyncResult };
type Entry = { workflowId: string; version: string; contentHash: string; url: string };
const compatibility = { appVersion: '1.4.17', adapters: [{ id: 'autodl-comfyui', operations: ['workflow.submit'] }], adapterVersions: { 'autodl-comfyui': '1.0.0' }, adapterArtifactKinds: { 'autodl-comfyui': ['video'] } };
const fail = (message: string): never => { throw new Error(message); };
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const schemaKeywords = new Set(['type', 'title', 'description', 'default', 'enum', 'const', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'items', 'properties', 'required', 'x-workflow.semantic', 'x-workflow.widget', 'x-workflow.acceptMime']);
function assertSupportedSchema(schema: Record<string, any>): void {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || Object.keys(schema).some(k => !schemaKeywords.has(k))) fail('Unsupported H3 schema keyword');
  for (const key of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']) if (schema[key] !== undefined && (!Number.isSafeInteger(schema[key]) || schema[key] < 0)) fail('Invalid schema bound');
  for (const [low, high] of [['minimum', 'maximum'], ['minLength', 'maxLength'], ['minItems', 'maxItems']]) if (schema[low] !== undefined && schema[high] !== undefined && schema[low] > schema[high]) fail('Invalid schema range');
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length || schema.enum.some((v: unknown) => typeof v !== schema.type && !(schema.type === 'integer' && Number.isSafeInteger(v))))) fail('Invalid schema enum');
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((k: unknown) => typeof k !== 'string' || !Object.prototype.hasOwnProperty.call(schema.properties ?? {}, k)))) fail('Invalid required input');
  if (schema.properties) for (const child of Object.values(schema.properties)) assertSupportedSchema(child as Record<string, any>);
  if (schema.items) assertSupportedSchema(schema.items);
}
/** Only the request vocabulary implemented by the installed H3 adapter is remotely extensible. */
export function assertRemoteH3Package(pkg: WorkflowPackage): void {
  const spec = pkg.spec;
  assertSupportedSchema(spec.inputSchema);
  if (spec.adapter.id !== 'autodl-comfyui' || spec.adapter.operation !== 'workflow.submit' || !spec.adapter.workflowId) fail('Unsupported adapter or operation');
  if (!versionPattern.test(spec.adapter.version) || compareVersions(spec.adapter.version, '1.0.0') > 0) fail('Adapter upgrade required');
  const types: Record<string, string> = { prompt: 'string', resolution: 'string', duration: 'integer', seed: 'integer', images: 'array', audios: 'array' };
  const props = (spec.inputSchema.properties ?? {}) as Record<string, import('../schema/types').JsonSchemaSubset>;
  const boundSources = new Set<string>();
  for (const [name, binding] of Object.entries(spec.bindings)) {
    const source = binding.startsWith('/') ? binding.slice(1).replace(/~1/g, '/').replace(/~0/g, '~') : '';
    if (!(name in types) || !props[source] || props[source].type !== types[name] || boundSources.has(source)) fail('Unsupported H3 input or binding');
    const field = props[source] as Record<string, any>;
    if (name === 'prompt' && (!Number.isInteger(field.minLength) || field.minLength < 1 || !Number.isInteger(field.maxLength) || field.maxLength > 10000)) fail('Unsupported prompt bounds');
    if (name === 'duration' && (!Number.isInteger(field.minimum) || field.minimum < 1 || !Number.isInteger(field.maximum) || field.maximum > 15)) fail('Unsupported duration bounds');
    if (name === 'seed' && (!Number.isSafeInteger(field.minimum) || field.minimum < 0 || !Number.isSafeInteger(field.maximum) || field.maximum > 999999999999999)) fail('Unsupported seed bounds');
    if (name === 'resolution' && (!Array.isArray(field.enum) || field.enum.some((v: unknown) => typeof v !== 'string' || !v.trim() || v.length > 100))) fail('Unsupported resolution');
    if (name === 'images' || name === 'audios') {
      if (!Number.isInteger(field.maxItems) || field.maxItems > (name === 'images' ? 9 : 3) || field.items?.type !== 'object') fail('Unsupported media bounds');
      const accepted = field['x-workflow.acceptMime'];
      const declared = field.items?.properties?.mime?.enum;
      if (accepted !== undefined && (!Array.isArray(accepted) || !Array.isArray(declared) || JSON.stringify([...accepted].sort()) !== JSON.stringify([...declared].sort()) || !field.items.required?.includes('mime'))) fail('MIME hints must match enforced item constraint');
      const supported = name === 'images' ? ['image/jpeg','image/png','image/webp'] : ['audio/mpeg','audio/wav','audio/flac','audio/mp4'];
      if (declared && declared.some((mime: string) => !supported.includes(mime))) fail('Unsupported media MIME');
    }
    boundSources.add(source);
  }
  if (Object.keys(props).some(name => !boundSources.has(name))) fail('Unbound H3 input');
  if (!spec.bindings.prompt || !spec.bindings.resolution || !spec.bindings.duration) fail('Missing H3 generation inputs');
  if (spec.capabilities?.length || (spec.limits && Object.keys(spec.limits).length)) fail('Unsupported package capabilities');
  if (spec.outputs.artifacts.length !== 1 || spec.outputs.artifacts[0].kind !== 'video' || spec.outputs.artifacts[0].from !== '/result/video') fail('Unsupported H3 output');
}
function parseIndex(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Invalid registry index');
  const value = raw as Record<string, any>;
  if (Object.keys(value).some(k => !['apiVersion', 'registryId', 'sequence', 'entries', 'signature'].includes(k)) || value.apiVersion !== 'autodl.workflow-registry/v1' || value.registryId !== 'autodl-official' || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || !Array.isArray(value.entries) || value.entries.length > 100 || typeof value.signature !== 'string' || !/^[a-f0-9]{128}$/.test(value.signature)) fail('Invalid registry index');
  const coordinates = new Set<string>();
  for (const entry of value.entries) {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).sort().join(',') !== 'contentHash,url,version,workflowId' || typeof entry.workflowId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(entry.workflowId) || typeof entry.version !== 'string' || !versionPattern.test(entry.version) || typeof entry.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.contentHash) || entry.url !== `${REMOTE_BASE}/packages/${entry.contentHash}.json`) fail('Invalid registry entry');
    const coordinate = `${entry.workflowId}@${entry.version}`;
    if (coordinates.has(coordinate)) fail('Duplicate registry coordinate');
    coordinates.add(coordinate);
  }
  return value as { apiVersion: string; registryId: string; sequence: number; entries: Entry[]; signature: string };
}
export function createRemoteWorkflowSync(deps: { repository: WorkflowRegistry; publicKey: string; state: { load(): Promise<RemoteSyncState>; save(state: RemoteSyncState): Promise<void> }; fetch?: typeof fetch; now?: () => number; timeoutMs?: number; maxBytes?: number }) {
  let running: Promise<RemoteSyncResult> | undefined;
  const compatible = (pkg: WorkflowPackage, definition: ReturnType<typeof registryRecordToDefinition>) => {
    assertRemoteH3Package(pkg);
    if (!validateWorkflowDefinition(definition, compatibility).ok || !isWorkflowCompatible(definition, compatibility)) fail('Workflow is incompatible');
  };
  async function fetchText(url: string): Promise<string> {
    if (url !== REMOTE_INDEX && !new RegExp(`^${REMOTE_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/packages/[a-f0-9]{64}\\.json$`).test(url)) fail('Registry URL rejected');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Registry request timed out')); }, deps.timeoutMs ?? 15000); });
    const limit = deps.maxBytes ?? 512 * 1024;
    try {
      const response = await Promise.race([(deps.fetch ?? fetch)(url, { signal: controller.signal, redirect: 'error', credentials: 'omit', headers: { Accept: 'application/json' } }), deadline]);
      if (!response.ok || response.redirected || (response.url && response.url !== url)) fail('Registry request failed or redirected');
      if (Number(response.headers.get('content-length') ?? 0) > limit) fail('Registry response too large');
      const reader = response.body?.getReader();
      if (!reader) {
        const body = await Promise.race([response.text(), deadline]);
        if (new TextEncoder().encode(body).length > limit) fail('Registry response too large');
        return body;
      }
      const chunks: Uint8Array[] = []; let length = 0;
      while (true) {
        const part = await Promise.race([reader.read(), deadline]); if (part.done) break;
        length += part.value.length; if (length > limit) { controller.abort(); void reader.cancel(); fail('Registry response too large'); }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return new TextDecoder().decode(bytes);
    } finally { if (timer) clearTimeout(timer); }
  }
  async function perform(): Promise<RemoteSyncResult> {
    let state: RemoteSyncState = {};
    let stateLoaded = false;
    const result: RemoteSyncResult = { at: (deps.now ?? Date.now)(), status: 'success', installed: 0, skipped: 0, errors: [] };
    try {
      state = await deps.state.load();
      stateLoaded = true;
      const index = parseIndex(JSON.parse(await fetchText(REMOTE_INDEX)));
      const { signature, ...payload } = index;
      const canonical = canonicalizeDefinition(payload);
      if (!await verifyEd25519(canonical, signature, deps.publicKey)) fail('Registry signature invalid');
      const indexHash = await sha256Hex(canonical);
      if (index.sequence < (state.sequence ?? 0) || (index.sequence === state.sequence && indexHash !== state.indexHash)) fail('Registry replay rejected');
      // Durably accept signed sequence before any installation. Equal index retries repair partial failures.
      state = { ...state, sequence: index.sequence, indexHash };
      await deps.state.save(state);
      const entries = [...index.entries].sort((a, b) => compareVersions(b.version, a.version));
      const selected = new Set<string>();
      for (const entry of entries) {
        if (selected.has(entry.workflowId)) { result.skipped++; continue; }
        try {
          const installed = await deps.repository.list({ workflowId: entry.workflowId });
          const highest = installed.filter(r => {
            try { return isWorkflowCompatible(registryRecordToDefinition(r), compatibility); } catch { return false; }
          }).sort((a, b) => compareVersions(b.version, a.version))[0];
          const same = installed.find(r => r.version === entry.version);
          if (same && (same.contentHash !== entry.contentHash || same.hashScheme !== WORKFLOW_PACKAGE_IDENTITY_V1)) fail('Immutable workflow coordinate conflict');
          if (highest && compareVersions(highest.version, entry.version) >= 0) { selected.add(entry.workflowId); result.skipped++; continue; }
          const verified = await parseVerifiedWorkflowPackage(JSON.parse(await fetchText(entry.url)), 'remote');
          if (verified.definition.id !== entry.workflowId || verified.definition.version !== entry.version || verified.packageHash !== entry.contentHash) fail('Workflow coordinate or hash mismatch');
          compatible(verified.pkg, verified.definition);
          if (!deps.repository.installAndActivate) fail('Atomic workflow installation unavailable');
          await deps.repository.installAndActivate!({ workflowId: entry.workflowId, version: entry.version, contentHash: entry.contentHash, hashScheme: WORKFLOW_PACKAGE_IDENTITY_V1, definitionJson: canonicalizePackage(verified.pkg), installedAt: result.at, source: 'remote', trust: 'trusted', repository: 'https://github.com/czh869452912/autodl_minimax_h3', ref: 'workflow-registry' });
          result.installed++; selected.add(entry.workflowId);
        } catch (error) { result.errors.push(`${entry.workflowId}@${entry.version}: ${error instanceof Error ? error.message : 'Sync failed'}`); }
      }
      if (result.errors.length) result.status = 'partial';
    } catch (error) { result.status = 'failed'; result.errors.push(error instanceof Error ? error.message : 'Sync failed'); }
    try { if (stateLoaded) await deps.state.save({ ...state, result: { ...result, errors: result.errors.slice(0, 3).map(message => message.slice(0, 180)) } }); } catch { result.status = 'failed'; result.errors.push('Cannot persist sync state'); }
    return result;
  }
  return { sync(): Promise<RemoteSyncResult> { if (!running) running = perform().finally(() => { running = undefined; }); return running; } };
}
