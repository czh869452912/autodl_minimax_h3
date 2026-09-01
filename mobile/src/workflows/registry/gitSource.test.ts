import { verifyCommitAttestation, type GitSubscriptionConfig } from './gitSource';

const config: GitSubscriptionConfig = { repository: 'https://github.com/acme/workflows.git', allowedRef: 'refs/heads/main', registryId: 'acme', key: { registryId: 'acme', publicKey: '00', status: 'active' } };

test('requires exact allowlisted repository/ref and a full commit sha', async () => {
  await expect(verifyCommitAttestation({ repository: config.repository, ref: config.allowedRef, commit: 'abc', treeHash: 'tree', entries: [] }, '00', config)).resolves.toMatchObject({ ok: false, code: 'COMMIT_INVALID' });
  await expect(verifyCommitAttestation({ repository: 'https://evil.test/repo.git', ref: config.allowedRef, commit: 'a'.repeat(40), treeHash: 'tree', entries: [] }, '00', config)).resolves.toMatchObject({ ok: false, code: 'REPOSITORY_REJECTED' });
});

test('rejects an attestation signed by an unknown or revoked key', async () => {
  const result = await verifyCommitAttestation({ repository: config.repository, ref: config.allowedRef, commit: 'a'.repeat(40), treeHash: 'b'.repeat(32), entries: [] }, '00', { ...config, key: { ...config.key, status: 'revoked' } });
  expect(result).toMatchObject({ ok: false, code: 'ATTESTATION_INVALID' });
});
