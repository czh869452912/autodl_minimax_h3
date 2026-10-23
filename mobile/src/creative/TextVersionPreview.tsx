import {useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {sha256File} from '../native/media';
import type {AssetVersion} from './types';
import {COLORS} from '../ui/theme';
export function TextVersionPreview({version}:{version:AssetVersion}){
  const [text,setText]=useState('');
  useEffect(()=>{let live=true;setText('读取文本…');void(async()=>{
    if(!version.relativePath||!version.blobSha256)throw new Error('文件不可用');
    const uri=`${FileSystem.documentDirectory}${version.relativePath}`,info=await FileSystem.getInfoAsync(uri);
    if(!info.exists||info.isDirectory)throw new Error('文件不可用');
    if(info.size>100*1024){if(live)setText('文本超过预览上限，请保存到下载文件夹后打开。');return;}
    if(await sha256File(uri)!==version.blobSha256)throw new Error('文件内容校验失败，请恢复原件');
    const content=await FileSystem.readAsStringAsync(uri);if(live)setText(content);
  })().catch(e=>{if(live)setText(e.message);});return()=>{live=false;};},[version.id,version.relativePath,version.blobSha256]);
  return <View style={{padding:12,borderWidth:1,borderColor:COLORS.border,borderRadius:8}}><Text selectable style={{color:COLORS.text,lineHeight:22}}>{text}</Text></View>;
}
