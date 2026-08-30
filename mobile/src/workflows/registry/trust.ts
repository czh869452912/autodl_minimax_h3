import { verifyEd25519 } from './crypto';
import type { RegistryKey } from './types';

export function isKeyUsable(key: RegistryKey, now = Date.now()): boolean {
  return key.status === 'active' && (key.validFrom == null || now >= key.validFrom) && (key.validUntil == null || now <= key.validUntil);
}

export async function verifySignedPayload(payload: string, signature: string, key: RegistryKey, now = Date.now()): Promise<boolean> {
  return isKeyUsable(key, now) && verifyEd25519(payload, signature, key.publicKey);
}
