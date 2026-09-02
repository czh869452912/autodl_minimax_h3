import { createBuiltinProviderAdapters, getBuiltinArtifactDownloadPolicy } from './registry';
import { autodlComfyUiManifest } from './autodl/manifest';

test('registers AutoDL without making runtime aware of provider transport details', () => {
  const transport = jest.fn();
  const extra = { manifest: () => ({ id: 'novelai' }) } as never;
  const adapters = createBuiltinProviderAdapters({ resolveCredential: (kind) => kind === 'autodl-token' ? 'token' : undefined, transport, additional: [extra] });
  expect(adapters.get('autodl-comfyui')?.manifest().id).toBe('autodl-comfyui');
  expect(adapters.get('novelai')?.manifest().id).toBe('novelai');
});

test('declares an explicit public artifact host allowlist for AutoDL', () => {
  expect(autodlComfyUiManifest.artifactDownloadPolicy?.allowedHosts).toEqual(['autodl.art']);
  expect(autodlComfyUiManifest.artifactDownloadPolicy?.allowProviderSuppliedPublicHosts).toBe(true);
  expect(autodlComfyUiManifest.artifactDownloadPolicy?.acceptedMimes).toEqual(['video/mp4']);
});

test('returns the exact reviewed AutoDL artifact policy without creating an adapter', () => {
  expect(getBuiltinArtifactDownloadPolicy('autodl-comfyui')).toEqual(autodlComfyUiManifest.artifactDownloadPolicy);
  expect(getBuiltinArtifactDownloadPolicy('unknown')).toBeUndefined();
});
