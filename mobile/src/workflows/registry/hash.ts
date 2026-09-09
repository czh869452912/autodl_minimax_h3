import SHA256 from 'crypto-js/sha256';
import encHex from 'crypto-js/enc-hex';

export async function sha256Hex(value: string): Promise<string> {
  return SHA256(value).toString(encHex);
}
