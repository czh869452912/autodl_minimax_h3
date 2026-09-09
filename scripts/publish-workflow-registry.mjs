import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'mobile/package.json'));
const ts = require('typescript');
// Run the exact app validators; the publisher must never accept a weaker package schema.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const { parseVerifiedWorkflowPackage, canonicalizePackage, isWorkflowCompatible } = require(join(root,'mobile/src/workflows/registry/packageVerification.ts'));
const { assertRemoteH3Package, REMOTE_BASE } = require(join(root,'mobile/src/workflows/registry/remoteSync.ts'));
const { canonicalizeDefinition } = require(join(root,'mobile/src/workflows/registry/canonicalize.ts'));
const { validateWorkflowDefinition } = require(join(root,'mobile/src/workflows/schema/validator.ts'));
const pinnedKey = JSON.parse(readFileSync(join(root,'mobile/src/workflows/registry/remoteConfig.json'),'utf8')).publicKey;
export async function publishRegistry({ output, sequence, privateKey, publicKey = pinnedKey, source = join(root,'registry/workflows') }) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Sequence must be a positive safe integer');
  const key = createPrivateKey(privateKey);
  const pub = createPublicKey(key);
  if (pub.asymmetricKeyType !== 'ed25519' || pub.export({type:'spki',format:'der'}).subarray(-32).toString('hex') !== publicKey) throw new Error('Signing key does not match app public key');
  const indexPath = join(output,'index.json');
  let previous;
  if (existsSync(indexPath)) {
    previous = JSON.parse(readFileSync(indexPath,'utf8'));
    const { signature, ...payload } = previous;
    if (!verify(null,Buffer.from(canonicalizeDefinition(payload)),pub,Buffer.from(signature,'hex'))) throw new Error('Existing index signature invalid');
    if (sequence <= previous.sequence) throw new Error('Sequence must increase');
  }
  const entries = []; const files = [];
  for (const directory of readdirSync(source, {withFileTypes:true}).filter(d => d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) {
    for (const file of readdirSync(join(source,directory.name)).filter(name => name.endsWith('.json')).sort()) {
      const verified = await parseVerifiedWorkflowPackage(JSON.parse(readFileSync(join(source,directory.name,file),'utf8')), 'remote');
      const { pkg, definition, packageHash } = verified;
      assertRemoteH3Package(pkg);
      if (directory.name !== pkg.metadata.id || file !== `${pkg.metadata.version}.json` || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.metadata.version)) throw new Error('Package source coordinate mismatch');
      const context = { adapters: [{id:'autodl-comfyui',operations:['workflow.submit']}],appVersion:JSON.parse(readFileSync(join(root,'mobile/package.json'),'utf8')).version,adapterVersions:{'autodl-comfyui':'1.0.0'} };
      if (!validateWorkflowDefinition(definition,context).ok || !isWorkflowCompatible(definition,context)) throw new Error('Package incompatible with publishing app');
      const prior = previous?.entries.find(e => e.workflowId === pkg.metadata.id && e.version === pkg.metadata.version);
      if (prior && prior.contentHash !== packageHash) throw new Error('Immutable workflow coordinate changed');
      const path = join(output,'packages',`${packageHash}.json`); const text = canonicalizePackage(pkg)+'\n';
      if (Buffer.byteLength(text) > 512 * 1024) throw new Error('Package exceeds app response limit');
      if (existsSync(path) && readFileSync(path,'utf8') !== text) throw new Error('Immutable package path changed');
      files.push({path,text});
      entries.push({ workflowId:pkg.metadata.id,version:pkg.metadata.version,contentHash:packageHash,url:`${REMOTE_BASE}/packages/${packageHash}.json` });
    }
  }
  if (!entries.length || entries.length > 100) throw new Error('Registry must contain 1–100 entries');
  // Preserve old signed coordinates in every publication so they cannot be reused later.
  for (const entry of previous?.entries ?? []) if (!entries.some(e=>e.workflowId===entry.workflowId && e.version===entry.version)) throw new Error('Published coordinates cannot be removed');
  const payload = { apiVersion:'autodl.workflow-registry/v1',registryId:'autodl-official',sequence,entries };
  const signature = sign(null,Buffer.from(canonicalizeDefinition(payload)),key).toString('hex');
  mkdirSync(join(output,'packages'),{recursive:true});
  for (const file of files) if (!existsSync(file.path)) writeFileSync(file.path,file.text,{flag:'wx'});
  writeFileSync(indexPath,JSON.stringify({...payload,signature},null,2)+'\n');
  return { sequence, packages: entries.length, indexHash: createHash('sha256').update(canonicalizeDefinition(payload)).digest('hex') };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index+1]; };
  const output = arg('--output');
  if (!output || !process.env.WORKFLOW_REGISTRY_PRIVATE_KEY) throw new Error('Provide --output, --sequence and WORKFLOW_REGISTRY_PRIVATE_KEY (PEM)');
  const result = await publishRegistry({output:resolve(output),sequence:Number(arg('--sequence')),privateKey:process.env.WORKFLOW_REGISTRY_PRIVATE_KEY});
  console.log(`Prepared signed registry sequence ${result.sequence}: ${result.packages} packages. No remote publication performed.`);
}
