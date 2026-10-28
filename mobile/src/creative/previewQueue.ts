type Entry={users:number;started:boolean;resolve:(uri:string|undefined)=>void;promise:Promise<string|undefined>;run:()=>Promise<string|undefined>};

// Share work between visible tiles. Scrolled-away requests are removed before
// entering the native decoder; running jobs finish without retaining bitmaps in JS.
export function createPreviewQueue(concurrency=2,maxWaiting=48,maxCached=128){
  const entries=new Map<string,Entry>(),cache=new Map<string,string>();
  let running=0;
  const pump=()=>{
    for(const [key,entry] of entries){
      if(running>=concurrency)break;
      if(entry.started||!entry.users)continue;
      entry.started=true;running++;
      void Promise.resolve().then(entry.run).then(uri=>{
        if(uri){cache.set(key,uri);while(cache.size>maxCached)cache.delete(cache.keys().next().value!);}
        entry.resolve(uri);
      },()=>entry.resolve(undefined)).finally(()=>{entries.delete(key);running--;pump();});
    }
  };
  return {
    invalidate:(key:string)=>{cache.delete(key);},
    request(key:string,run:()=>Promise<string|undefined>){
      const cached=cache.get(key);
      if(cached){cache.delete(key);cache.set(key,cached);return {promise:Promise.resolve(cached),retryAfter:undefined as number|undefined,release:()=>{}};}
      let entry=entries.get(key);
      if(!entry){
        if(entries.size-running>=maxWaiting)return {promise:Promise.resolve(undefined),retryAfter:250,release:()=>{}};
        let resolve!:(uri:string|undefined)=>void;
        const promise=new Promise<string|undefined>(done=>{resolve=done;});
        entry={users:0,started:false,resolve,promise,run};entries.set(key,entry);
      }
      entry.users++;pump();let released=false;const owned=entry;
      return {promise:entry.promise,retryAfter:undefined as number|undefined,release:()=>{
        if(released)return;released=true;owned.users--;
        if(!owned.users&&!owned.started){entries.delete(key);owned.resolve(undefined);}
      }};
    },
  };
}
export const previewQueue=createPreviewQueue();
