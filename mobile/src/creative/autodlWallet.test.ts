import {fetchWalletBalance,saveWalletCredential,walletCredential,clearWalletCredential} from './autodlWallet';
const mockStore=new Map<string,string>();
jest.mock('expo-secure-store',()=>({getItemAsync:async(k:string)=>mockStore.get(k),setItemAsync:async(k:string,v:string)=>{mockStore.set(k,v);},deleteItemAsync:async(k:string)=>{mockStore.delete(k);}}));
test('wallet uses a separate developer endpoint and keeps vouchers separate',async()=>{
 const transport=jest.fn().mockResolvedValue({ok:true,json:async()=>({code:'Success',data:{assets:12345,accumulate:55000,voucher_balance:2000}})});
 const result=await fetchWalletBalance('developer',transport);
 expect(result).toMatchObject({assets:12.345,accumulate:55,vouchers:2});
 expect(transport).toHaveBeenCalledWith('https://api.autodl.com/api/v1/dev/wallet/balance',expect.objectContaining({method:'POST',headers:{Authorization:'developer'}}));
});
test('changing generation never reuses the previous wallet credential',async()=>{
 await saveWalletCredential('old','developer');expect(await walletCredential('old')).toBe('developer');
 expect(await walletCredential('new')).toBeUndefined();await clearWalletCredential();expect(await walletCredential('old')).toBeUndefined();
});
test('unknown or malformed balance is an error, not a zero balance',async()=>{
 for(const data of [{},{assets:'1000',accumulate:0,voucher_balance:0},{assets:NaN,accumulate:0,voucher_balance:0}]){
  await expect(fetchWalletBalance('secret',jest.fn().mockResolvedValue({ok:true,json:async()=>({code:'Success',data})}))).rejects.toThrow('暂无法读取余额');
 }
});
