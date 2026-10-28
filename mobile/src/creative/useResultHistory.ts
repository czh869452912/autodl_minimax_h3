import {useCallback,useRef,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {creativeService} from './runtime';
import type {AssetVersion} from './types';
import type {HistoryCursor,HistoryScope} from './resultHistory';

export function useResultHistory(scope:HistoryScope,enabled=true,query='',poll=true,refreshKey?:string|null){
  const key=JSON.stringify([ [...new Set(scope.assetIds)].sort(),scope.jobId,query]);
  const [rows,setRows]=useState<AssetVersion[]>([]),[next,setNext]=useState<HistoryCursor>(),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const more=useRef<()=>void>(()=>{});
  useFocusEffect(useCallback(()=>{
    if(!enabled)return;
    let active=true,reading=false,stamp:string|undefined,cursor:HistoryCursor|undefined,loaded=false;
    const [assetIds,jobId,search]=JSON.parse(key) as [string[],string|undefined,string];
    setRows([]);setNext(undefined);setError('');
    const read=async(append=false)=>{
      if(!active||reading||append&&!cursor)return;
      reading=true;setLoading(true);
      try{
        const service=creativeService();
        const page=await service.resultHistoryPage({assetIds,jobId,query:search,after:append?cursor:undefined});
        if(!active)return;
        if(append||page.stamp!==stamp){
          const versions=await service.versionsByIds(page.ids),byId=new Map(versions.map(v=>[v.id,v]));
          const ordered=page.ids.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);
          if(!active)return;
          setRows(old=>(loaded?[...ordered,...old.filter(v=>!page.ids.includes(v.id))]:ordered).sort((a,b)=>(b.createdAt??0)-(a.createdAt??0)||(a.id<b.id?1:a.id>b.id?-1:0)));
          cursor=page.next;setNext(cursor);
          if(!append)stamp=page.stamp;
          loaded=true;
        }
        setError('');
      }catch{if(active)setError('历史读取失败，请重试');}
      finally{reading=false;if(active)setLoading(false);}
    };
    more.current=()=>void read(Boolean(cursor));
    void read();const timer=poll?setInterval(()=>void read(),2500):undefined;
    return()=>{active=false;more.current=()=>{};if(timer)clearInterval(timer);};
  },[key,enabled,poll,refreshKey]));
  return {rows,next,loading,error,loadMore:()=>more.current()};
}
