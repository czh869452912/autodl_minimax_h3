import {useEffect,useState} from 'react';
import {Image,NativeModules,Text,View} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type {AssetVersion} from './types';
import {ListAction} from '../ui/ListPageUI';
import {COLORS} from '../ui/theme';
type Page={uri:string;pageCount:number;width:number;height:number};
export function PdfVersionPreview({version}:{version:AssetVersion}){
  const [open,setOpen]=useState(false),[index,setIndex]=useState(0),[page,setPage]=useState<Page>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let live=true;if(!open)return;setBusy(true);setPage(undefined);setError('');
    void(async()=>{
      const render=NativeModules.AutoDLMedia?.renderCreativePdf;
      if(!render||!version.relativePath||!version.blobSha256)throw new Error('当前安装包不支持 PDF 预览，可保存原件后打开。');
      const result:Page=await render(`${FileSystem.documentDirectory}${version.relativePath}`,version.blobSha256,index);
      if(live)setPage(result);
    })().catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setBusy(false);});
    return()=>{live=false;};
  },[open,index,version.id,version.relativePath,version.blobSha256]);
  return <View style={{gap:8}}><ListAction label={open?'收起 PDF':'预览 PDF'} secondary onPress={()=>setOpen(!open)}/>
    {open?<>{busy?<Text style={{color:COLORS.textMuted}}>正在离线渲染…</Text>:null}
      {page?<><Image accessibilityLabel={`PDF 第 ${index+1} 页`} source={{uri:page.uri}} style={{width:'100%',aspectRatio:page.width/page.height}} resizeMode="contain"/>
        <Text style={{color:COLORS.textMuted}}>第 {index+1} / {page.pageCount} 页</Text>
        <View style={{flexDirection:'row',gap:8}}><ListAction label="上一页" secondary disabled={busy||index===0} onPress={()=>setIndex(index-1)}/><ListAction label="下一页" secondary disabled={busy||index+1>=page.pageCount} onPress={()=>setIndex(index+1)}/></View>
      </>:null}{error?<Text accessibilityRole="alert" style={{color:COLORS.danger}}>{error}</Text>:null}</>:null}
  </View>;
}
