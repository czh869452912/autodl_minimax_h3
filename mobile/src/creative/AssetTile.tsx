import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { creativeService } from './runtime';
import type { AssetVersion, CreativeAsset } from './types';
import { creativeUI as s } from './creativeUI';
import { MediaPreview } from './MediaPreview';
export function AssetTile({ asset, onPress }: { asset: CreativeAsset; onPress: () => void }) {
  const [version, setVersion] = useState<AssetVersion>();
  useEffect(() => { let active = true; void creativeService().versions(asset.id).then(rows => { if (active) setVersion(rows.find(v => v.id === asset.currentVersionId) ?? rows[0]); }).catch(() => undefined); return () => { active = false; }; }, [asset.id, asset.currentVersionId, asset.updatedAt]);
  return <Pressable accessibilityRole="button" accessibilityLabel={`打开资产 ${asset.title}`} style={({ pressed }) => [{ flexGrow: 1, flexBasis: 150, minWidth: 140, gap: 8, opacity: pressed ? 0.7 : 1 }]} onPress={onPress}>
    <MediaPreview version={version} kind={asset.kind} label={asset.title} />
    <View style={{ paddingHorizontal: 2, paddingBottom: 12, gap: 2 }}><Text style={[s.body, { fontWeight: '600' }]} numberOfLines={2}>{asset.title}</Text><Text style={s.muted}>{({ image: '图片', video: '视频', audio: '音频', prompt: '提示词', document: '文档' })[asset.kind]}{version ? ` · 版本 ${version.versionNo}` : ''}{!asset.currentVersionId ? ' · 候选' : ''}</Text></View>
  </Pressable>;
}
