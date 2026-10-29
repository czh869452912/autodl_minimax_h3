import assert from 'node:assert/strict';
import { createHash as native } from 'node:crypto';
import { createHash } from './sha256.cjs';
const vectors = [new Uint8Array(), new Uint8Array([0, 255, 128, 1, 0]), new TextEncoder().encode('中文🎥\u0000'), Uint8Array.from({ length: 100003 }, (_, i) => i % 256)];
for (const bytes of vectors) {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), native('sha256').update(bytes).digest('hex'));
  const chunked = createHash('sha256');
  for (let offset = 0; offset < bytes.length; offset += 17) chunked.update(bytes.subarray(offset, offset + 17));
  assert.equal(chunked.digest('hex'), native('sha256').update(bytes).digest('hex'));
  assert.throws(() => chunked.update(bytes));
}
const backing = new Uint8Array([99, 0, 255, 128, 99]);
assert.equal(createHash('sha256').update(backing.subarray(1, 4)).digest('hex'), native('sha256').update(backing.subarray(1, 4)).digest('hex'));
assert.throws(() => createHash('md5'));
console.log('SHA-256: 9 byte/stream/subarray comparisons passed');
