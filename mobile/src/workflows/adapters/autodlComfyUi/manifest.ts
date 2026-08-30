import type { PlatformAdapterManifest } from '../../schema/types';
export const autodlComfyUiManifest: PlatformAdapterManifest = { id: 'autodl-comfyui', adapterVersion: '1.0.0', platforms: ['autodl'], capabilities: ['workflow.submit', 'workflow.poll'], credentialKinds: ['autodl-token'], operations: ['workflow.submit'], supportedArtifactKinds: ['video'] };
