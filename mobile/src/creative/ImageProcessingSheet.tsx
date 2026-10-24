import { useRef, useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import type { AssetVersion } from './types';
import { novelAiDraftInput } from './novelAiProtocol';
import { createImageProcessingDraft } from './imageProcessing';
import { ParameterSheet, SettingRow } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';

export function ImageProcessingSheet({version,projectId,shotId,onClose,replace=false}:{version:AssetVersion;projectId?:string;shotId?:string;onClose:()=>void;replace?:boolean}) {
  const router=useRouter(),lock=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const canEnhance=novelAiDraftInput.safeParse(version.recipe.input).success;
  const open=async(operation:'enhance'|'upscale')=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      const result=await createImageProcessingDraft(version,operation,{projectId,shotId});
      if(result.status!=='completed')throw new Error('未能准备处理草稿，请重试');
      onClose();
      const target={pathname:'/image-draft/[id]' as const,params:{id:result.value.draftId}};
      if(replace)router.replace(target);else router.push(target);
    }catch(e){setError(e instanceof Error?e.message:'处理准备失败');}
    finally{lock.current=false;setBusy(false);}
  };
  return <ParameterSheet title="增强 / 放大" description={`当前版本 ${version.versionNo} · 先调整，确认后生成`} onClose={()=>{if(!busy)onClose();}}>
    <SettingRow label="细节增强 · Enhance" value="调整倍率与变化强度，重新绘制细节" disabled={busy || !canEnhance} onPress={()=>void open('enhance')} />
    {!canEnhance?<Text style={s.muted}>缺少完整生成参数，细节增强不可用；仍可清晰放大。</Text>:null}
    <SettingRow label="清晰放大 · 2×" value="宽高各放大 2 倍，尽量保留原画面" disabled={busy} onPress={()=>void open('upscale')} />
    {busy?<Text accessibilityLiveRegion="polite" style={s.muted}>正在准备草稿…</Text>:null}
    {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  </ParameterSheet>;
}
