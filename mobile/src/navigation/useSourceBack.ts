import {useCallback} from 'react';
import {useRouter} from 'expo-router';
import {useFallbackBack} from './useFallbackBack';
/** Return to the actual stack source; cold links have a stable workspace exit. */
export function useSourceBack(){
 const router=useRouter();
 const back=useCallback(()=>{if(router.canGoBack())router.back();else router.replace('/(tabs)/projects');},[router]);
 useFallbackBack(back);
 return back;
}
