import {AppIcon} from '../ui/icons';
import {COLORS} from '../ui/theme';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { creativeService } from './runtime';
import type { AssetVersion, CreativeAsset } from './types';
import { creativeUI as s } from './creativeUI';
import { MediaPreview } from './MediaPreview';
export function AssetTile({ asset, onPress, selected=false }: { asset: CreativeAsset; onPress: () => void; selected?:boolean }) {
  const [version, setVersion] = useState<AssetVersion>();
  useEffect(() => { let active = true; void (asset.currentVersionId ? creativeService().versionsByIds([asset.currentVersionId]) : creativeService().latestVersions([asset.id])).then(rows => { if (active) setVersion(rows.find(v => v.id === asset.currentVersionId) ?? rows[0]); }).catch(() => undefined); return () => { active = false; }; }, [asset.id, asset.currentVersionId, asset.updatedAt]);
  return <Pressable accessibilityRole="button" accessibilityState={{selected}} accessibilityLabel={`打开资产 ${asset.title}`} style={({ pressed }) => [{ flexGrow: 1, flexBasis: 150, minWidth: 140, gap: 7, paddingBottom:8, opacity: pressed ? 0.7 : 1 }]} onPress={onPress}>
    <View style={{borderRadius:10,overflow:'hidden',borderWidth:1,borderColor:selected?COLORS.primary:COLORS.border}}>{asset.kind==='audio'||asset.kind==='document'||asset.kind==='prompt'?<View accessibilityLabel={asset.title} style={{aspectRatio:1.25,backgroundColor:COLORS.surface,alignItems:'center',justifyContent:'center',gap:12}}><View style={{width:44,height:44,borderRadius:12,backgroundColor:COLORS.primarySoft,alignItems:'center',justifyContent:'center'}}><AppIcon name={asset.kind==='audio'?'library_music':'list_alt'} size={24} color={COLORS.primary}/></View><Text style={{fontSize:11,color:COLORS.textMuted}}>{version?.state==='MISSING'?'原文件待恢复':version?.mime?.split('/')[1]?.replace('mpeg','MP3').toUpperCase()??(asset.kind==='audio'?'音频':'文档')}</Text></View>:<MediaPreview version={version} kind={asset.kind} label={asset.title} style={{aspectRatio:1.25,borderRadius:0}}/>}</View>
    <View style={{ paddingHorizontal: 1, gap: 3 }}><Text style={[s.body, { fontWeight: '600',fontSize:13,lineHeight:18 }]} numberOfLines={1}>{asset.title}</Text><Text style={[s.muted,{fontSize:11,lineHeight:16}]}>{({ image: '图片', video: '视频', audio: '音频', prompt: '提示词', document: '文档' })[asset.kind]}{version ? ` · 版本 ${version.versionNo}` : ''}{!asset.currentVersionId ? ' · 候选' : ''}</Text></View>
  </Pressable>;
}
