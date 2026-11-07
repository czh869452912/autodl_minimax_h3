// Android compiler smoke entry; no account, application data or network access.
import '../src/runtimeCompatibility';
import React,{useEffect,useState} from 'react';
import {Text,ScrollView} from 'react-native';
import {registerRootComponent} from 'expo';
import {openDatabaseAsync} from 'expo-sqlite';
function Root(){
 const [result,setResult]=useState('正在检查原生异步返回值…');
 useEffect(()=>{void(async()=>{
  const db=await openDatabaseAsync('native-async-probe.db',{useNewConnection:true});
  try{
   const query=()=>db.getAllAsync('SELECT 7 AS value');
   const service={async projects(archived=false){return (await query()).map(row=>row.value+(archived?1:0));}};
   const values=[await service.projects(),await service.projects(true),...await Promise.all([service.projects(),service.projects(true)])];
   if(JSON.stringify(values)!=='[[7],[8],[7],[8]]')throw Error('ASYNC_VALUE_MISMATCH');
   setResult('PASS · 默认参数、异步查询与并发返回值均正确');
  }finally{await db.closeAsync();}
 })().catch(error=>setResult('FAIL · '+String(error)));},[]);
 return <ScrollView contentContainerStyle={{padding:24}}><Text selectable>{result}</Text></ScrollView>;
}
registerRootComponent(Root);
