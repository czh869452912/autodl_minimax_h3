import {useCallback,useRef} from 'react';
import {BackHandler} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
/** Let an existing stack handle Back; a cold deep link still has an exit. */
export function useFallbackBack(fallback:()=>void){
 const router=useRouter(),latest=useRef(fallback);latest.current=fallback;
 useFocusEffect(useCallback(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(router.canGoBack())return false;latest.current();return true;});return()=>sub.remove();},[router]));
}
