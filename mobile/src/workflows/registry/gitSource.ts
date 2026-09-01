import { canonicalizeDefinition } from './canonicalize';
import { verifySignedPayload } from './trust';
import type { RegistryKey, RegistryIndexEntry } from './types';

export type GitSubscriptionConfig = { repository: string; allowedRef: string; registryId: string; key: RegistryKey };
export type CommitAttestation = { repository: string; ref: string; commit: string; treeHash: string; entries: RegistryIndexEntry[] };
export type AttestationResult = { ok: true; attestation: CommitAttestation } | { ok: false; code: 'REPOSITORY_REJECTED' | 'REF_REJECTED' | 'COMMIT_INVALID' | 'ATTESTATION_INVALID'; message: string };

export async function verifyCommitAttestation(attestation: CommitAttestation, signature: string, config: GitSubscriptionConfig, now = Date.now()): Promise<AttestationResult> {
  if (attestation.repository !== config.repository) return { ok: false, code: 'REPOSITORY_REJECTED', message: 'repository is not allowlisted' };
  if (attestation.ref !== config.allowedRef) return { ok: false, code: 'REF_REJECTED', message: 'git ref is not allowlisted' };
  if (!/^[0-9a-f]{40,64}$/i.test(attestation.commit) || !/^[0-9a-f]{32,128}$/i.test(attestation.treeHash)) return { ok: false, code: 'COMMIT_INVALID', message: 'commit/tree hash is malformed' };
  const payload = canonicalizeDefinition({ repository: attestation.repository, ref: attestation.ref, commit: attestation.commit.toLowerCase(), treeHash: attestation.treeHash.toLowerCase(), entries: attestation.entries });
  if (!(await verifySignedPayload(payload, signature, { ...config.key, registryId: config.registryId }, now))) return { ok: false, code: 'ATTESTATION_INVALID', message: 'commit attestation signature is invalid' };
  return { ok: true, attestation: { ...attestation, commit: attestation.commit.toLowerCase(), treeHash: attestation.treeHash.toLowerCase() } };
}

export function fixedCommitUrl(repository: string, commit: string, path: string): string {
  const base = repository.replace(/\.git$/, '').replace(/\/$/, '');
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(base)) throw new Error('repository is not a fixed HTTPS GitHub URL');
  if (!/^[0-9a-f]{40,64}$/i.test(commit)) throw new Error('commit must be a full hash');
  if (!path || path.includes('..') || path.startsWith('/')) throw new Error('invalid repository path');
  const [owner, repo] = new URL(base).pathname.split('/').filter(Boolean);
  return `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
