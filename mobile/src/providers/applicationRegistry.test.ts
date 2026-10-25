import { createApplicationProviderRegistry, type ApplicationProviderRegistration } from './applicationRegistry';
import { autodlComfyUiManifest } from '../workflows/providers/autodl/manifest';
import type { ProviderAdapter } from '../workflows/providers/registry';

test('an additional provider receives only its own identity and exposes policy without constructing transport', () => {
  const create = jest.fn(() => ({ manifest: () => ({ id: 'extra-video' }) }) as ProviderAdapter);
  const extra: ApplicationProviderRegistration = { manifest: { ...autodlComfyUiManifest, id: 'extra-video' }, provider: 'extra', statusSource: 'remote', create };
  const registry = createApplicationProviderRegistry({} as never, [extra]);
  expect(registry.artifactDownloadPolicy('extra-video')).toEqual(extra.manifest.artifactDownloadPolicy);
  expect(registry.artifactDownloadPolicy('unknown')).toBeUndefined();
  expect(create).not.toHaveBeenCalled();
  expect(() => registry.adapter('extra-video', { provider: 'autodl', accountId: 'a', generationId: 'g', token: 'wrong-provider-secret' }, 'job')).toThrow('ACCOUNT_PROVIDER_MISMATCH');
  expect(create).not.toHaveBeenCalled();
  registry.adapter('extra-video', { provider: 'extra', accountId: 'a', generationId: 'g', token: 'extra-secret' }, 'job');
  expect(create).toHaveBeenCalledWith({ jobId: 'job', token: 'extra-secret' });
  expect(registry.artifactDownloadPolicy('autodl-comfyui')).toEqual(autodlComfyUiManifest.artifactDownloadPolicy);
});

test('duplicate provider registrations and mismatched adapter identities fail closed', () => {
  const create = jest.fn(() => ({ manifest: () => ({ id: 'other' }) }) as ProviderAdapter);
  const registration: ApplicationProviderRegistration = { manifest: { ...autodlComfyUiManifest, id: 'extra' }, provider: 'extra', statusSource: 'remote', create };
  expect(() => createApplicationProviderRegistry({} as never, [registration, registration])).toThrow('ADAPTER_DUPLICATE');
  const registry = createApplicationProviderRegistry({} as never, [registration]);
  expect(() => registry.adapter('unknown', { provider: 'extra', accountId: 'a', generationId: 'g', token: 's' }, 'j')).toThrow('ADAPTER_UNAVAILABLE');
  expect(() => registry.adapter('extra', { provider: 'extra', accountId: 'a', generationId: 'g', token: 's' }, 'j')).toThrow('ADAPTER_ID_MISMATCH');
});

test('declares an explicit public artifact host allowlist for AutoDL', () => {
  expect(autodlComfyUiManifest.artifactDownloadPolicy?.allowedHosts).toEqual(['autodl.art']);
  expect(autodlComfyUiManifest.artifactDownloadPolicy?.allowProviderSuppliedPublicHosts).toBe(true);
  expect(autodlComfyUiManifest.artifactDownloadPolicy?.acceptedMimes).toEqual(['video/mp4']);
});
