import * as SecureStore from 'expo-secure-store';
import { getDatabase } from '../storage/databaseClient';
import { createCreativeAccounts } from './accounts';
import { createCreativeBudget } from './budget';
import { verifyAccount } from './accountVerification';

const accounts = (db = getDatabase()) => createCreativeAccounts(db, {
  now: Date.now, verify: verifyAccount,
  secrets: { get: SecureStore.getItemAsync, set: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }), remove: SecureStore.deleteItemAsync },
});
const migrations=new WeakMap<object,Promise<void>>();
async function migrateAutodl(db:ReturnType<typeof getDatabase>){
  let pending=migrations.get(db);
  if(!pending){pending=(async()=>{
    const current=accounts(db),legacy=await SecureStore.getItemAsync('autodl.token');
    if(!legacy||legacy.trim().length<8||legacy.trim().length>4096)return;
    if(!(await current.list()).some(row=>row.provider_id==='autodl'))await current.connect('autodl',legacy.trim());
    await SecureStore.deleteItemAsync('autodl.token');
  })();migrations.set(db,pending);pending.finally(()=>migrations.delete(db)).catch(()=>undefined);}
  await pending;
}
export function creativeAccounts(db=getDatabase()){
  const current=accounts(db);
  return {...current,
    async list(){await migrateAutodl(db);return current.list();},
    async connect(provider:Parameters<typeof current.connect>[0],token:string){if(provider==='autodl')await migrateAutodl(db);const result=await current.connect(provider,token);if(provider==='autodl')await SecureStore.deleteItemAsync('autodl.token');return result;},
    async disconnect(provider:Parameters<typeof current.disconnect>[0]){if(provider==='autodl')await migrateAutodl(db);await current.disconnect(provider);if(provider==='autodl')await SecureStore.deleteItemAsync('autodl.token');},
  };
}
export async function defaultAutodlCredential(db=getDatabase()){
  const current=creativeAccounts(db),account=(await current.list()).find(row=>row.provider_id==='autodl');
  return account?current.resolveExact(account.credential_generation_id):null;
}
export const creativeBudget = () => createCreativeBudget(getDatabase());
