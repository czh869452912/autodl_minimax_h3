import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, verify } from 'node:crypto';
import { publishRegistry } from './publish-workflow-registry.mjs';
const key = generateKeyPairSync('ed25519');
const encode = value => value && typeof value === 'object' ? Array.isArray(value) ? `[${value.map(encode)}]` : `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${encode(value[k])}`).join(',')}}` : JSON.stringify(value);
test('publisher emits verifiable signed index and rejects sequence replay', async () => {
  const dir = mkdtempSync(join(tmpdir(),'workflow-registry-'));
  try {
    const args = {output:dir,sequence:1,privateKey:key.privateKey.export({type:'pkcs8',format:'pem'}),publicKey:key.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex')};
    await publishRegistry(args);
    const {signature,...payload} = JSON.parse(readFileSync(join(dir,'index.json'),'utf8'));
    assert.ok(verify(null,Buffer.from(encode(payload)),key.publicKey,Buffer.from(signature,'hex')));
    assert.ok(payload.entries.length >= 2);
    await assert.rejects(publishRegistry(args), /Sequence must increase/);
    await assert.rejects(publishRegistry({...args,sequence:2,publicKey:'00'.repeat(32)}), /does not match/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
