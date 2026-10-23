/* Explicit opt-in provider acceptance. No credentials are passed in command-line arguments.
 * This exercises production protocol code on Node, not the Android UI or SecureStore.
 * Keep the evidence directory across runs: sent markers prohibit automatic resubmission.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText, filename);
};
const { verifyAccount } = require('../src/creative/accountVerification.ts');
const { defaultNovelAiDraft, prepareNovelAiRequest, parseNovelAiResponse } = require('../src/creative/novelAiProtocol.ts');
const { createAutodlClient } = require('../src/workflows/providers/autodl/client.ts');
const { buildAutodlSubmitRequest, normalizeAutodlStatus, parseAutodlResult } = require('../src/workflows/providers/autodl/mapping.ts');
const root = path.resolve(__dirname, '../../build/creative-live-acceptance');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const file = name => path.join(root, name);
function save(name, value) {
  const bytes = typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2);
  const fd = fs.openSync(file(name + '.part'), 'w');
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(file(name + '.part'), file(name));
}
function markSent(name, request) {
  // Atomic across processes, fsynced before HTTP. Never delete a marker to retry.
  const fd = fs.openSync(file(name + '.sent.json'), 'wx');
  try { fs.writeFileSync(fd, JSON.stringify({ at: new Date().toISOString(), requestHash: sha(request) })); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
function readEnv() {
  const result = {};
  for (const line of fs.readFileSync(path.resolve(__dirname, '../../../.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) result[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  for (const key of ['NOVELAI_ACCESS_TOKEN', 'AUTODL_ACCESS_TOKEN']) if (!result[key]) throw new Error('LIVE_CREDENTIAL_MISSING');
  return result;
}
async function main() {
  const mode = process.argv[2] ?? 'verify';
  if (!['verify', 'image', 'video', 'status'].includes(mode)) throw new Error('INVALID_MODE');
  fs.mkdirSync(root, { recursive: true });
  if (mode === 'verify') {
    const env = readEnv();
    await verifyAccount('novelai', env.NOVELAI_ACCESS_TOKEN);
    save('verification.json', { at: new Date().toISOString(), novelai: 'verified', autodl: 'not-remotely-verified' });
    console.log('NovelAI image credential verified; no generation submitted.');
    return;
  }
  if (mode === 'image') {
    const prepared = prepareNovelAiRequest({ ...defaultNovelAiDraft, seed: 24102026,
      prompt: 'scenery, no humans, hilltop observatory, telescope dome, starry night, northern lights, peaceful landscape, detailed anime background',
      negative: 'text, watermark, blurry' });
    if (!fs.existsSync(file('novelai.response.json'))) {
      if (!process.argv.includes('--submit')) throw new Error('EXPLICIT_SUBMIT_REQUIRED');
      const env = readEnv();
      await verifyAccount('novelai', env.NOVELAI_ACCESS_TOKEN);
      save('novelai.request.json', prepared.requestJson);
      markSent('novelai', prepared.requestJson);
      const response = await fetch('https://image.novelai.net/ai/generate-image', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(240000),
        headers: { Authorization: `Bearer ${env.NOVELAI_ACCESS_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: prepared.requestJson,
      });
      save('novelai.http.json', { status: response.status, contentType: response.headers.get('content-type') });
      if (!response.ok) throw new Error('NOVELAI_HTTP_FAILURE');
      const raw = await response.text();
      save('novelai.response.json', raw);
    }
    const raw = fs.readFileSync(file('novelai.response.json'), 'utf8');
    const sent = JSON.parse(fs.readFileSync(file('novelai.sent.json'), 'utf8'));
    if (sent.requestHash !== prepared.requestHash) throw new Error('CACHED_REQUEST_MISMATCH');
    const [result] = parseNovelAiResponse(raw);
    const bytes = Buffer.from(result.image, 'base64');
    save('observatory.png', bytes);
    const evidence = { model: prepared.snapshot.model, requestHash: prepared.requestHash, responseHash: sha(raw),
      sha256: sha(bytes), byteSize: bytes.length, width: result.width, height: result.height, seed: result.seed, source: 'production-protocol-node' };
    save('novelai.evidence.json', evidence);
    console.log(JSON.stringify(evidence));
    return;
  }
  const client = () => createAutodlClient({ transport: (url, init) => fetch(url, { ...init, redirect: 'error' }), token: readEnv().AUTODL_ACCESS_TOKEN });
  if (mode === 'video') {
    if (!fs.existsSync(file('autodl.submit.json'))) {
      if (!process.argv.includes('--submit')) throw new Error('EXPLICIT_SUBMIT_REQUIRED');
      const image = fs.readFileSync(file('observatory.png'));
      const evidence = JSON.parse(fs.readFileSync(file('novelai.evidence.json'), 'utf8'));
      if (sha(image) !== evidence.sha256) throw new Error('REFERENCE_HASH_MISMATCH');
      const input = { prompt: '镜头缓慢推近山顶天文台，极光在夜空中轻轻流动，星光闪烁，保持建筑和构图稳定。',
        duration: 5, resolution: '480p竖', seed: 24102026,
        images: [{ dataUri: `data:image/png;base64,${image.toString('base64')}`, mime: 'image/png', uri: 'observatory.png' }] };
      const request = JSON.stringify(buildAutodlSubmitRequest(input));
      save('autodl.request.json', request);
      markSent('autodl', request);
      // Client is the same implementation used by the app. No automatic POST retry.
      const result = await client().submit(input);
      save('autodl.submit.json', result);
    }
    const submitted = JSON.parse(fs.readFileSync(file('autodl.submit.json'), 'utf8'));
    if (typeof submitted.task_id !== 'string' || !submitted.task_id) throw new Error('MISSING_PROVIDER_HANDLE');
    console.log('AutoDL submission handle saved. Use status to query without resubmitting.');
    return;
  }
  const submitted = JSON.parse(fs.readFileSync(file('autodl.submit.json'), 'utf8'));
  if (typeof submitted.task_id !== 'string' || !submitted.task_id) throw new Error('MISSING_PROVIDER_HANDLE');
  const result = await client().getStatus(submitted.task_id);
  save('autodl.status.json', result);
  const status = normalizeAutodlStatus(result.status);
  const artifacts = parseAutodlResult(result.results);
  let videoEvidence;
  const video = artifacts.find(a => a.kind === 'video');
  if (status === 'SUCCEEDED' && video) {
    if (!fs.existsSync(file('observatory.mp4'))) {
      const url = new URL(video.uri);
      if (url.protocol !== 'https:' || url.username || url.password || !/^[a-z0-9.-]+$/i.test(url.hostname)
        || /(^localhost$|\.local$|^\d+\.\d+\.\d+\.\d+$)/i.test(url.hostname)) throw new Error('UNSAFE_ARTIFACT_URL');
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(180000) });
      if (!response.ok || !response.body) throw new Error('VIDEO_DOWNLOAD_FAILED');
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 256 * 1024 * 1024) throw new Error('VIDEO_TOO_LARGE');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.subarray(4, 8).toString() !== 'ftyp') throw new Error('VIDEO_FORMAT_INVALID');
      save('observatory.mp4', bytes);
    }
    const bytes = fs.readFileSync(file('observatory.mp4'));
    videoEvidence = { sha256: sha(bytes), byteSize: bytes.length, mime: 'video/mp4' };
  }
  save('autodl.evidence.json', { status, artifactCount: artifacts.length, video: videoEvidence, at: new Date().toISOString() });
  console.log(JSON.stringify({ status, artifacts: artifacts.map(a => ({ kind: a.kind, mime: a.mime })) }));
}
main().catch(error => {
  // Never print raw provider bodies, network error messages, stack traces or secrets.
  const localCode = /^[A-Z_]+$/.test(error.message ?? '') ? error.message : null;
  console.error(JSON.stringify({ failed: true, code: error.code ?? localCode, kind: error.kind ?? null, httpStatus: error.status ?? null }));
  process.exitCode = 1;
});
