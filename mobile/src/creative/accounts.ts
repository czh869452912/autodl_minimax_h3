import CryptoJS from 'crypto-js';
import { createId } from '../ids';
import type { AppDatabase } from '../storage/appDatabase';
import { withWriteTransaction } from '../storage/sqliteBusy';

export type CreativeProvider = 'novelai' | 'autodl';
export type VerifiedIdentity = { namespace: string; principalId?: string; authenticated?: boolean };
type Deps = {
  now(): number;
  verify(provider: CreativeProvider, token: string): Promise<VerifiedIdentity>;
  secrets: { get(key: string): Promise<string | null>; set(key: string, secret: string): Promise<void>; remove(key: string): Promise<void> };
};
export function createCreativeAccounts(db: AppDatabase, deps: Deps) {
  return {
    async list() { return db.getAllAsync<{ provider_id: CreativeProvider; account_binding_id: string; credential_generation_id: string; identity_mode: string; created_at: number }>('SELECT d.*,a.identity_mode,g.created_at FROM creative_default_accounts d JOIN creative_account_bindings a ON a.id=d.account_binding_id JOIN creative_credential_generations g ON g.id=d.credential_generation_id'); },
    async connect(provider: CreativeProvider, token: string) {
      if (!['novelai','autodl'].includes(provider) || token.length < 8 || token.length > 4096 || token !== token.trim()) throw new Error('CREDENTIAL_INVALID');
      const identity = await deps.verify(provider, token);
      if (!identity.namespace) throw new Error('ACCOUNT_VERIFICATION_FAILED');
      const accountId = createId(), generationId = createId(), key = `creative.credential.${generationId}`;
      const now = deps.now();
      // Persist a retired record first: a crash cannot make an unwritten secret active.
      await withWriteTransaction(db, async tx => {
        if (identity.authenticated === false && identity.principalId) throw new Error('UNVERIFIED_PRINCIPAL');
        await tx.runAsync('INSERT INTO creative_account_bindings VALUES(?,?,?,?,?,?,?)', accountId, provider, identity.namespace, identity.principalId ?? null, identity.principalId ? 'provider_verified' : 'credential_bound', now, identity.authenticated === false ? 0 : now);
        await tx.runAsync("INSERT INTO creative_credential_generations VALUES(?,?,?,?,1,'retired',?,?)", generationId, accountId, key, CryptoJS.SHA256(token).toString(), now, now);
      });
      try {
        if (await deps.secrets.get(key) != null) throw new Error('CREDENTIAL_SLOT_ALREADY_EXISTS');
        await deps.secrets.set(key, token);
        if (await deps.secrets.get(key) !== token) throw new Error('CREDENTIAL_WRITE_FAILED');
        await withWriteTransaction(db, async tx => {
          await tx.runAsync("UPDATE creative_authorizations SET revoked_at=COALESCE(revoked_at,?),revision=revision+1 WHERE provider_id=?", now, provider);
          await tx.runAsync("UPDATE creative_credential_generations SET status='retired' WHERE status='active' AND account_binding_id IN(SELECT id FROM creative_account_bindings WHERE provider_id=?)", provider);
          await tx.runAsync("UPDATE creative_credential_generations SET status='active' WHERE id=? AND status='retired'", generationId);
          await tx.runAsync('INSERT INTO creative_default_accounts VALUES(?,?,?) ON CONFLICT(provider_id) DO UPDATE SET account_binding_id=excluded.account_binding_id,credential_generation_id=excluded.credential_generation_id', provider, accountId, generationId);
        });
      } catch (error) { await deps.secrets.remove(key).catch(() => undefined); throw error; }
      return { accountId, generationId, identityMode: identity.principalId ? 'provider_verified' : 'credential_bound' };
    },
    async disconnect(provider: CreativeProvider) {
      await withWriteTransaction(db, async tx => {
        await tx.runAsync("UPDATE creative_authorizations SET revoked_at=COALESCE(revoked_at,?),revision=revision+1 WHERE provider_id=?", deps.now(), provider);
        await tx.runAsync("UPDATE creative_credential_generations SET status='revoked' WHERE account_binding_id IN(SELECT id FROM creative_account_bindings WHERE provider_id=?)", provider);
        await tx.runAsync('DELETE FROM creative_default_accounts WHERE provider_id=?', provider);
      });
      const rows = await db.getAllAsync<{ secure_store_key: string }>('SELECT secure_store_key FROM creative_credential_generations WHERE account_binding_id IN(SELECT id FROM creative_account_bindings WHERE provider_id=?)', provider);
      for (const row of rows) await deps.secrets.remove(row.secure_store_key);
    },
    async resolveExact(generationId: string, use: 'dispatch' | 'query' = 'dispatch') {
      const row = await db.getFirstAsync<{ id: string; account_binding_id: string; provider_id: CreativeProvider; secure_store_key: string; token_digest: string; status: string; principal_namespace: string; verified_principal_id: string | null; identity_mode: string }>('SELECT g.*,a.provider_id,a.principal_namespace,a.verified_principal_id,a.identity_mode FROM creative_credential_generations g JOIN creative_account_bindings a ON a.id=g.account_binding_id WHERE g.id=?', generationId);
      if (!row || row.status === 'revoked' || (use === 'dispatch' && row.status !== 'active')) throw new Error('CREDENTIAL_GENERATION_INACTIVE');
      const token = await deps.secrets.get(row.secure_store_key);
      if (!token || CryptoJS.SHA256(token).toString() !== row.token_digest) throw new Error('CREDENTIAL_GENERATION_MISMATCH');
      const identity = await deps.verify(row.provider_id, token);
      if (identity.namespace !== row.principal_namespace || (row.identity_mode === 'provider_verified' && identity.principalId !== row.verified_principal_id)) throw new Error('ACCOUNT_IDENTITY_MISMATCH');
      // Caller carries this exact secret to dispatch. Never resolve a default again.
      return { token, accountId: row.account_binding_id, generationId: row.id, provider: row.provider_id };
    },
  };
}
