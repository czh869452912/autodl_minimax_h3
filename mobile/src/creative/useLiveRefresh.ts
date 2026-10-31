import {useCallback,useRef} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {executorEvents} from '../tasks/executorEvents';

/** Focus and foreground own refresh lifetime; polling is only a fallback for external writes. */
export function useLiveRefresh(load:(current:()=>boolean)=>Promise<void>,interval=3000,identity=""){
 const latest=useRef(load);latest.current=load;
 useFocusEffect(useCallback(()=>{
  let live=true,reading=false,again=false;
  const current=()=>live&&(AppState.currentState===null||AppState.currentState==='active');
  const refresh=async()=>{
   if(!current())return;
   if(reading){again=true;return;}
   reading=true;
   try{await latest.current(current);}finally{reading=false;if(again&&current()){again=false;void refresh();}}
  };
  const wake=()=>{void refresh();};
  wake();
  const timer=setInterval(wake,interval),app=AppState.addEventListener('change',wake);
  const unsubscribe=executorEvents.subscribe(wake);
  return()=>{live=false;clearInterval(timer);app.remove();unsubscribe();};
 },[interval,identity]));
}
