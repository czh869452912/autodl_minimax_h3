import {useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {readCreativeText} from './textContent';
import type {AssetVersion} from './types';
import {COLORS} from '../ui/theme';
export function TextVersionPreview({version}:{version:AssetVersion}){
  const [text,setText]=useState('');
  useEffect(()=>{let live=true;setText('读取文本…');void(async()=>{
    const content=await readCreativeText(version);if(live)setText(content);
  })().catch(e=>{if(live)setText(e.message);});return()=>{live=false;};},[version.id,version.relativePath,version.blobSha256,version.state]);
  return <View style={{padding:12,borderWidth:1,borderColor:COLORS.border,borderRadius:8}}><Text selectable style={{color:COLORS.text,lineHeight:22}}>{text}</Text></View>;
}
