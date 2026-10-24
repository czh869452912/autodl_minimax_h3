import * as FileSystem from 'expo-file-system/legacy';
import {sha256File} from '../native/media';
import type {AppDatabase} from '../storage/appDatabase';

/** Resolve immutable asset references only inside the application CAS. */
export function createInputReader(db:AppDatabase,deps={read:(uri:string)=>FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64}),hash:sha256File,root:FileSystem.documentDirectory??''}){
  return async(uri:string)=>{
    if(uri.startsWith('asset://')){
      const hash=/^asset:\/\/([a-f0-9]{64})$/.exec(uri)?.[1];if(!hash)throw new Error('素材引用无效，请重新选择');
      const blob=await db.getFirstAsync<{relative_path:string}>('SELECT relative_path FROM artifact_blobs WHERE sha256=?',hash);
      if(!blob||blob.relative_path!==`cas/sha256/${hash.slice(0,2)}/${hash}`)throw new Error('参考素材记录缺失，请重新添加');
      uri=deps.root+blob.relative_path;if(await deps.hash(uri)!==hash)throw new Error('参考素材原件缺失或损坏，请恢复原件');
    }
    if(!/^(file|content):\/\//.test(uri))throw new Error('参考素材不是可读取的本地文件');
    return deps.read(uri);
  };
}
