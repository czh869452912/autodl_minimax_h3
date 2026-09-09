import nacl from 'tweetnacl';
import { Buffer } from 'buffer';
import source from '../definitions/autodl/minimax-h3-i2v-15s-v1.0.1.package.json';
import { createWorkflowRegistry } from './repository';
import { canonicalizeDefinition } from './canonicalize';
import { parseVerifiedWorkflowPackage } from './packageVerification';
import { createRemoteWorkflowSync, REMOTE_BASE, type RemoteSyncState } from './remoteSync';
const pair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7));
const hex = (v: Uint8Array) => Buffer.from(v).toString('hex');
async function setup() {
  const pkg = JSON.parse(JSON.stringify(source));
  const verified = await parseVerifiedWorkflowPackage(pkg, 'remote');
  let state: RemoteSyncState = {};
  let sequence = 1;
  let entries = [{ workflowId: pkg.metadata.id, version: pkg.metadata.version, contentHash: verified.packageHash, url: `${REMOTE_BASE}/packages/${verified.packageHash}.json` }];
  let tamper = false;
  const fetcher = jest.fn(async (url: string) => {
    const payload = { apiVersion: 'autodl.workflow-registry/v1', registryId: 'autodl-official', sequence, entries };
    const signature = hex(nacl.sign.detached(new TextEncoder().encode(canonicalizeDefinition(payload)), pair.secretKey));
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(url.endsWith('index.json') ? { ...payload, signature: tamper ? '00'.repeat(64) : signature } : pkg) } as unknown as Response;
  });
  const repository = createWorkflowRegistry(undefined);
  const sync = createRemoteWorkflowSync({ repository, state: { load: async () => state, save: async next => { state = next; } }, publicKey: hex(pair.publicKey), fetch: fetcher as unknown as typeof fetch, now: () => 123 });
  return { repository, sync, fetcher, state: () => state, setSequence: (v: number) => { sequence = v; }, tamper: () => { tamper = true; }, entries: (v: typeof entries) => { entries = v; }, pkg };
}
test('verifies real Ed25519 signature, installs, and identical manual sync preserves previous pointer', async () => {
  const s = await setup(); expect(s.fetcher).not.toHaveBeenCalled();
  expect((await s.sync.sync()).installed).toBe(1);
  const pointer = await s.repository.getActivePointer!(s.pkg.metadata.id);
  expect((await s.sync.sync()).installed).toBe(0);
  expect(await s.repository.getActivePointer!(s.pkg.metadata.id)).toEqual(pointer);
  expect(s.state().sequence).toBe(1);
});
test('rejects signature tampering without installing', async () => { const s = await setup(); s.tamper(); expect((await s.sync.sync()).status).toBe('failed'); expect(await s.repository.list()).toHaveLength(0); });
test('rejects older signed index and same sequence changed contents', async () => {
  const s = await setup(); await s.sync.sync(); s.setSequence(0); expect((await s.sync.sync()).status).toBe('failed');
  s.setSequence(1); s.entries([]); expect((await s.sync.sync()).status).toBe('failed'); expect(s.state().sequence).toBe(1);
});
test('rejects arbitrary package URL before requesting it', async () => { const s = await setup(); s.entries([{ workflowId: 'x', version: '1.0.0', contentHash: 'a'.repeat(64), url: 'https://evil.example/a' }]); expect((await s.sync.sync()).status).toBe('failed'); expect(s.fetcher).toHaveBeenCalledTimes(1); });
test('coordinate mismatch retains old active package', async () => {
  const s = await setup(); await s.sync.sync(); const old = await s.repository.getActive(s.pkg.metadata.id);
  s.setSequence(2); const hash = old!.contentHash;
  s.entries([{ workflowId: s.pkg.metadata.id, version: '1.0.2', contentHash: hash, url: `${REMOTE_BASE}/packages/${hash}.json` }]);
  expect((await s.sync.sync()).status).toBe('partial'); expect(await s.repository.getActive(s.pkg.metadata.id)).toEqual(old);
});
test('does not downgrade even when a newer installed version is inactive', async () => {
  const s = await setup(); await s.sync.sync(); const old = (await s.repository.list())[0];
  await s.repository.upsert({ ...old, version: '2.0.0', definitionJson: JSON.stringify({ ...s.pkg, metadata: { ...s.pkg.metadata, version: '2.0.0' } }) });
  s.setSequence(2);
  expect((await s.sync.sync()).installed).toBe(0);
  expect((await s.repository.getActive(s.pkg.metadata.id))?.version).toBe('1.0.1');
});
test('a package hash mismatch is rejected', async () => {
  const s = await setup(); s.pkg.metadata.title = 'tampered';
  expect((await s.sync.sync()).status).toBe('partial'); expect(await s.repository.list()).toHaveLength(0);
});
test('new signed incompatible adapter retains installed workflow', async () => {
  const s = await setup(); await s.sync.sync();
  s.pkg.metadata.version = '1.0.2'; delete s.pkg.metadata.contentHash; s.pkg.spec.adapter.operation = 'shell.execute';
  const {packageHash} = await parseVerifiedWorkflowPackage(s.pkg, 'remote');
  s.setSequence(2); s.entries([{workflowId:s.pkg.metadata.id,version:'1.0.2',contentHash:packageHash,url:`${REMOTE_BASE}/packages/${packageHash}.json`}]);
  expect((await s.sync.sync()).status).toBe('partial'); expect((await s.repository.getActive(s.pkg.metadata.id))?.version).toBe('1.0.1');
});
test('state load failure never resets replay history or fetches', async () => {
  const fetcher = jest.fn(); const save = jest.fn();
  const sync = createRemoteWorkflowSync({repository:createWorkflowRegistry(undefined),publicKey:hex(pair.publicKey),state:{load:async()=>{throw new Error('SecureStore unavailable');},save},fetch:fetcher});
  expect((await sync.sync()).status).toBe('failed'); expect(save).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});
test('state write failure prevents package installation', async () => {
  const s = await setup();
  const sync = createRemoteWorkflowSync({repository:s.repository,publicKey:hex(pair.publicKey),state:{load:async()=>({}),save:async()=>{throw new Error('disk full');}},fetch:s.fetcher as unknown as typeof fetch});
  expect((await sync.sync()).status).toBe('failed'); expect(await s.repository.list()).toHaveLength(0);
});
test('fetch rejects redirects and oversized responses', async () => {
  for (const response of [{ok:true,redirected:true},{ok:true,headers:{get:()=> '9999999'}}]) {
    const sync=createRemoteWorkflowSync({repository:createWorkflowRegistry(undefined),publicKey:hex(pair.publicKey),state:{load:async()=>({}),save:async()=>{}},fetch:jest.fn(async()=>response) as unknown as typeof fetch});
    expect((await sync.sync()).status).toBe('failed');
  }
});
test('fetch has an independent deadline even when fetch ignores abort', async () => {
  const sync=createRemoteWorkflowSync({repository:createWorkflowRegistry(undefined),publicKey:hex(pair.publicKey),state:{load:async()=>({}),save:async()=>{}},timeoutMs:5,fetch:jest.fn(()=>new Promise(()=>{})) as unknown as typeof fetch});
  expect((await sync.sync()).errors[0]).toContain('timed out');
});
import { assertRemoteH3Package } from './remoteSync';
import zm from '../../../../registry/workflows/autodl.minimax-h3.zm-u24/1.0.0.json';
import { compileWorkflow } from '../compiler/compiler';
test('remote schema rejects silently unsupported keywords and provider caps', () => {
  for (const mutate of [
    (p: any) => { p.spec.inputSchema.allOf = []; },
    (p: any) => { p.spec.inputSchema.properties.duration.maximum = 60; },
    (p: any) => { p.spec.inputSchema.properties.images.maxItems = 100; },
    (p: any) => { p.spec.inputSchema.properties.audios['x-workflow.acceptMime'] = ['audio/mp4']; },
  ]) { const pkg = JSON.parse(JSON.stringify(zm)); mutate(pkg); expect(() => assertRemoteH3Package(pkg)).toThrow(); }
});
test('real signed ZM package installs with route identity, seed zero and MIME constraint', async () => {
  const s = await setup(); Object.keys(s.pkg).forEach(k => delete s.pkg[k]); Object.assign(s.pkg, JSON.parse(JSON.stringify(zm)));
  const {packageHash} = await parseVerifiedWorkflowPackage(s.pkg,'remote');
  s.entries([{workflowId:s.pkg.metadata.id,version:s.pkg.metadata.version,contentHash:packageHash,url:`${REMOTE_BASE}/packages/${packageHash}.json`}]);
  expect((await s.sync.sync()).installed).toBe(1);
  const record = (await s.repository.getActive(s.pkg.metadata.id))!;
  const {definition} = await parseVerifiedWorkflowPackage(JSON.parse(record.definitionJson),'remote');
  expect(definition.platform.workflowId).toBe('minimax_h3_zm_u24');
  const compiler = compileWorkflow(definition, record.contentHash);
  const values = {prompt:'test',resolution:'480p(1:1)',duration:5,seed:0,images:[{mime:'image/png'}],audios:[]};
  expect(compiler.validateDraft(values).ok).toBe(true); expect(compiler.buildRequest(values).seed).toBe(0);
  expect(compiler.validateDraft({...values,audios:[{mime:'audio/mp4'}]}).ok).toBe(false);
});
