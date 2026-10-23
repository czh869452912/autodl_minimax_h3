import * as FileSystem from 'expo-file-system/legacy';
import {sha256File} from '../native/media';
import type {AssetVersion} from './types';
export async function readCreativeText(version:AssetVersion){
  if(version.state!=='AVAILABLE'||!version.relativePath||!version.blobSha256)throw new Error('文件不可用');
  const uri=`${FileSystem.documentDirectory}${version.relativePath}`,info=await FileSystem.getInfoAsync(uri);
  if(!info.exists||info.isDirectory)throw new Error('文件不可用');
  if(info.size>100*1024)throw new Error('文本超过 100KB，请保存到下载文件夹后打开。');
  if(await sha256File(uri)!==version.blobSha256)throw new Error('文件内容校验失败，请恢复原件');
  return FileSystem.readAsStringAsync(uri);
}
