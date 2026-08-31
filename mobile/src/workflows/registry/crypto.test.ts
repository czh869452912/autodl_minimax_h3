import { sha256Hex, verifyEd25519 } from './crypto';

test('hashes canonical text with SHA-256', async () => {
  expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('verifies RFC 8032 Ed25519 vectors and rejects malformed signatures', async () => {
  const publicKey = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
  const signature = 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155' +
    '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';
  await expect(verifyEd25519('', signature, publicKey)).resolves.toBe(true);
  await expect(verifyEd25519('changed', signature, publicKey)).resolves.toBe(false);
  await expect(verifyEd25519('', 'bad', publicKey)).resolves.toBe(false);
});
