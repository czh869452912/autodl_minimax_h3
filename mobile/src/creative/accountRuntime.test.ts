import * as SecureStore from 'expo-secure-store';
import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {creativeAccounts,defaultAutodlCredential} from './accountRuntime';
const mockSecrets=new Map<string,string>();
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(async(k:string)=>mockSecrets.get(k)??null),setItemAsync:jest.fn(async(k:string,v:string)=>{mockSecrets.set(k,v);}),deleteItemAsync:jest.fn(async(k:string)=>{mockSecrets.delete(k);})}));
jest.mock('./accountVerification',()=>({verifyAccount:async()=>({namespace:'https://www.autodl.art/api',authenticated:false})}));
beforeEach(()=>{mockSecrets.clear();});

test('legacy-only credentials migrate once under concurrent readers and remain available after old key deletion',async()=>{
  const db=createInitializedRealSqliteTestDb();mockSecrets.set('autodl.token','legacy-test-secret');
  try{
    const accounts=creativeAccounts(db as never);const [a,b]=await Promise.all([accounts.list(),accounts.list()]);
    expect(a).toEqual(b);expect(a).toHaveLength(1);expect(mockSecrets.has('autodl.token')).toBe(false);
    expect((await defaultAutodlCredential(db as never))?.token).toBe('legacy-test-secret');
    expect(db.getAllSync('SELECT id FROM creative_credential_generations')).toHaveLength(1);
    await accounts.disconnect('autodl');expect(await defaultAutodlCredential(db as never)).toBeNull();
    expect(await accounts.list()).toEqual([]);
  }finally{db.close();}
});

test('unified credentials take priority over an obsolete legacy token, and lost secrets are not treated as connected',async()=>{
  const db=createInitializedRealSqliteTestDb();
  try{
    const accounts=creativeAccounts(db as never);await accounts.connect('autodl','current-test-secret');
    mockSecrets.set('autodl.token','obsolete-test-secret');
    expect((await defaultAutodlCredential(db as never))?.token).toBe('current-test-secret');
    expect(mockSecrets.has('autodl.token')).toBe(false);
    for(const key of mockSecrets.keys())mockSecrets.delete(key);
    await expect(defaultAutodlCredential(db as never)).rejects.toThrow();
    expect(SecureStore.getItemAsync).toHaveBeenCalled();
  }finally{db.close();}
});
