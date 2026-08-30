import SHA256 from 'crypto-js/sha256';
import encHex from 'crypto-js/enc-hex';
import nacl from 'tweetnacl';

function hex(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) throw new Error('invalid hex');
  return Uint8Array.from(value.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)));
}

export async function sha256Hex(value: string): Promise<string> {
  return SHA256(value).toString(encHex);
}

export async function verifyEd25519(payload: string, signature: string, publicKey: string): Promise<boolean> {
  try { return nacl.sign.detached.verify(new TextEncoder().encode(payload), hex(signature), hex(publicKey)); } catch { return false; }
}
