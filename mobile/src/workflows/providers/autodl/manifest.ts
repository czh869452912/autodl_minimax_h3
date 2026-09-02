import type { PlatformAdapterManifest } from '../../schema/types';

export const autodlComfyUiManifest: PlatformAdapterManifest = {
  id: 'autodl-comfyui',
  adapterVersion: '1.0.0',
  platforms: ['autodl'],
  capabilities: ['workflow.submit', 'workflow.poll'],
  credentialKinds: ['autodl-token'],
  operations: ['workflow.submit'],
  supportedArtifactKinds: ['video'],
  artifactDownloadPolicy: { allowedHosts: ['autodl.art'], allowProviderSuppliedPublicHosts: true, acceptedMimes: ['video/mp4'], maxBytes: 2 * 1024 * 1024 * 1024, timeoutMs: 30_000 },
};
