import type { AppDatabase } from '../storage/appDatabase';
import type { ResolvedCredential } from './credentials';
import { createInputReader } from '../media/inputReader';
import { createAutodlComfyUiAdapter } from '../workflows/providers/autodl/adapter';
import type { ProviderAdapter } from '../workflows/providers/registry';
import { createNovelAiAdapter, novelAiManifest } from '../creative/novelAiAdapter';
import { novelAiResponseStore } from '../creative/novelAiResponseStore';
import { getNativeHttpTransport } from './httpTransport';
import { autodlComfyUiManifest } from '../workflows/providers/autodl/manifest';
import type { PlatformAdapterManifest } from '../workflows/schema/types';

type ProviderContext = { jobId: string; token: string };
export type ApplicationProviderRegistration = {
  manifest: PlatformAdapterManifest;
  provider: string;
  statusSource: 'remote' | 'local-receipt';
  create(context: ProviderContext): ProviderAdapter;
};

/** Application composition: native resources and provider identities stay outside the durable executor. */
export function createApplicationProviderRegistry(db: AppDatabase, additional: ApplicationProviderRegistration[] = []) {
  const registrations: ApplicationProviderRegistration[] = [
    { manifest: autodlComfyUiManifest, provider: 'autodl', statusSource: 'remote', create: ({ token }) => createAutodlComfyUiAdapter({ token, transport: getNativeHttpTransport(), readBase64: createInputReader(db) }) },
    { manifest: novelAiManifest, provider: 'novelai', statusSource: 'local-receipt', create: ({ jobId, token }) => createNovelAiAdapter(jobId, token, novelAiResponseStore(db)) },
    ...additional,
  ];
  const byId = new Map<string, ApplicationProviderRegistration>();
  for (const registration of registrations) {
    if (byId.has(registration.manifest.id)) throw new Error('PROVIDER_ADAPTER_DUPLICATE');
    byId.set(registration.manifest.id, registration);
  }
  const registration = (adapterId: string) => {
    const value = byId.get(adapterId);
    if (!value) throw new Error('PROVIDER_ADAPTER_UNAVAILABLE');
    return value;
  };
  return {
    artifactDownloadPolicy(adapterId: string) { return byId.get(adapterId)?.manifest.artifactDownloadPolicy; },
    workflowAdapters() { return new Map(registrations.map(({ manifest }) => [manifest.id, { manifest: () => manifest }])); },
    registration,
    adapter(adapterId: string, identity: ResolvedCredential, jobId: string) {
      const definition = registration(adapterId);
      if (identity.provider !== definition.provider) throw new Error('ACCOUNT_PROVIDER_MISMATCH');
      const adapter = definition.create({ jobId, token: identity.token });
      if (adapter.manifest().id !== definition.manifest.id) throw new Error('PROVIDER_ADAPTER_ID_MISMATCH');
      return adapter;
    },
  };
}
export type ApplicationProviderRegistry = ReturnType<typeof createApplicationProviderRegistry>;
