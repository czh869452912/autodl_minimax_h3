import releaseHistory from '../definitions/autodl/release-history.json';
import releaseManifestJson from '../definitions/autodl/release-manifest.json';
import { builtinWorkflowReleases } from './builtin';
import {
  RegistryReleaseError,
  collectManifestLiveHashes,
  parseBuiltinReleaseDescriptor,
  prepareBuiltinReleaseSet,
} from './releaseManifest';

const cloneReleaseSet = (): any => JSON.parse(JSON.stringify(builtinWorkflowReleases));

test('pins immutable H3 packages and the exact historical v1.0.0 representation', async () => {
  const prepared = await prepareBuiltinReleaseSet(builtinWorkflowReleases);
  expect(prepared.releases.map((item) => [item.record.version, item.record.contentHash])).toEqual([
    ['1.0.0', 'b3d2ac04b13f581527a580d49abea9d9cc079ee8c8a6681232cd2cdbfda8ce81'],
    ['1.0.1', 'fe166625b82f953d23eac160ed509f468b2383b7d7c8be6383abca9096381897'],
  ]);
  expect(prepared.releases[0].acceptedHistorical).toContainEqual({
    workflowId: 'autodl.minimax-h3.i2v-15s',
    version: '1.0.0',
    format: 'legacy-workflow-definition@1',
    identity: {
      scheme: 'workflow-definition/sorted-json@1',
      digest: '917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390',
    },
  });
  expect(prepared.manifestHash).toBe('93a5882eda1013a0232588ec824d817b8dd63f6317f4ecd08c9c09206b6305c5');
  expect(releaseHistory['mobile-1.4.10']).toBe(prepared.manifestHash);
});

test('collects primary and accepted historical digests as live references', async () => {
  const hashes = collectManifestLiveHashes(await prepareBuiltinReleaseSet(builtinWorkflowReleases));
  expect([...hashes].sort()).toEqual([
    '917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390',
    'b3d2ac04b13f581527a580d49abea9d9cc079ee8c8a6681232cd2cdbfda8ce81',
    'fe166625b82f953d23eac160ed509f468b2383b7d7c8be6383abca9096381897',
  ].sort());
});

test.each([
  ['duplicate coordinate', (manifest: any) => manifest.releases.push(JSON.parse(JSON.stringify(manifest.releases[0])))],
  ['wrong declared digest', (manifest: any) => { manifest.releases[0].identity.digest = '0'.repeat(64); }],
  ['unknown identity scheme', (manifest: any) => { manifest.releases[0].identity.scheme = 'workflow-package/unknown@9'; }],
])('rejects %s before database writes', async (_name, mutate) => {
  const manifest = cloneReleaseSet();
  mutate(manifest);
  await expect(prepareBuiltinReleaseSet(manifest)).rejects.toBeInstanceOf(RegistryReleaseError);
});

test('rejects descriptor package filenames that are missing, duplicated, or unknown', () => {
  const names = [
    'minimax-h3-i2v-15s-v1.0.0.package.json',
    'minimax-h3-i2v-15s-v1.0.1.package.json',
  ] as const;
  expect(() => parseBuiltinReleaseDescriptor(releaseManifestJson, names)).not.toThrow();
  for (const mutate of [
    (value: any) => { value.releases.pop(); },
    (value: any) => { value.releases[1].packageFile = value.releases[0].packageFile; },
    (value: any) => { value.releases[1].packageFile = 'unknown.package.json'; },
  ]) {
    const value: any = JSON.parse(JSON.stringify(releaseManifestJson));
    mutate(value);
    expect(() => parseBuiltinReleaseDescriptor(value, names)).toThrow(RegistryReleaseError);
  }
});
