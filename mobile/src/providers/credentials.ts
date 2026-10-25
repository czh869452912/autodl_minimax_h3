/** Persist references; resolve secrets only at the application/provider boundary. */
export type CredentialReference = { accountId: string; generationId: string; provider: string };
export type ResolvedCredential = CredentialReference & { token: string };
export type CredentialUse = 'dispatch' | 'query';
export type ExactCredentialResolver = (id: string, use: CredentialUse) => Promise<ResolvedCredential>;

export function credentialReference(identity: CredentialReference): CredentialReference {
  const { accountId, generationId, provider } = identity;
  return { accountId, generationId, provider };
}
