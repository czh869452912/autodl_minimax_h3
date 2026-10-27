import * as SecureStore from 'expo-secure-store';
import {getNativeHttpTransport,type HttpTransport} from '../providers/httpTransport';
export const WALLET_KEY='autodl.wallet.developer';
export type WalletBalance={assets:number;vouchers:number;accumulate:number;checkedAt:number};
export async function walletCredential(generationId:string){
  const raw=await SecureStore.getItemAsync(WALLET_KEY);if(!raw)return;
  try{const stored=JSON.parse(raw);if(stored.generationId===generationId&&typeof stored.token==='string')return stored.token as string;}catch{/* Invalid stored configuration is disconnected. */}
}
export const clearWalletCredential=()=>SecureStore.deleteItemAsync(WALLET_KEY);
export async function saveWalletCredential(generationId:string,token:string){
  await SecureStore.setItemAsync(WALLET_KEY,JSON.stringify({generationId,token}),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
}
export async function fetchWalletBalance(token:string,transport:HttpTransport=getNativeHttpTransport()):Promise<WalletBalance>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10_000);
  try{
    const response=await transport('https://api.autodl.com/api/v1/dev/wallet/balance',{method:'POST',headers:{Authorization:token},signal:controller.signal});
    if(!response.ok)throw new Error('余额查询失败，请检查开发者 Token 和网络');
    const body=await response.json(),data=body?.data;
    if(body?.code!=='Success'||!data||![data.assets,data.accumulate,data.voucher_balance].every(v=>typeof v==='number'&&Number.isSafeInteger(v)))throw new Error('余额响应无效，请核对开发者 Token');
    return {assets:data.assets/1000,vouchers:data.voucher_balance/1000,accumulate:data.accumulate/1000,checkedAt:Date.now()};
  }catch{throw new Error('暂无法读取余额，请检查开发者 Token 和网络');}
  finally{clearTimeout(timer);}
}
