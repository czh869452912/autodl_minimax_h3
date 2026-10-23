import * as SecureStore from 'expo-secure-store';
import { getDatabase } from '../storage/databaseClient';
import { createCreativeAccounts } from './accounts';
import { createCreativeBudget } from './budget';
import { verifyAccount } from './accountVerification';

export const creativeAccounts = (db = getDatabase()) => createCreativeAccounts(db, {
  now: Date.now, verify: verifyAccount,
  secrets: { get: SecureStore.getItemAsync, set: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }), remove: SecureStore.deleteItemAsync },
});
export const creativeBudget = () => createCreativeBudget(getDatabase());
