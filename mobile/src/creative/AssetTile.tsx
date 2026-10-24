import { useEffect, useState } from 'react';
import { Image, Pressable, Text } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { creativeService } from './runtime';
import type { AssetVersion, CreativeAsset } from './types';
import { creativeUI as s } from './creativeUI';
export function AssetTile({ asset, onPress }: { asset: CreativeAsset; onPress: () => void }) {
  const [version, setVersion] = useState<AssetVersion>();
  useEffect(() => { let active = true; void creativeService().versions(asset.id).then(rows => { if (active) setVersion(rows.find(v => v.id === asset.currentVersionId) ?? rows[0]); }).catch(() => undefined); return () => { active = false; }; }, [asset.id, asset.currentVersionId, asset.updatedAt]);
  return <Pressable accessibilityRole="button" accessibilityLabel={`打开资产 ${asset.title}`} style={[s.card, { flexGrow: 1, flexBasis: 150, minWidth: 140 }]} onPress={onPress}>
    {version?.relativePath && version.state === 'AVAILABLE' && version.mime?.startsWith('image/') ? <Image source={{ uri: `${FileSystem.documentDirectory}${version.relativePath}` }} style={{ width: '100%', height: 140, borderRadius: 8 }} resizeMode="cover" /> : null}
    <Text style={s.title} numberOfLines={2}>{asset.title}</Text><Text style={s.muted}>{({ image: '图片', video: '视频', audio: '音频', prompt: '提示词', document: '文档' })[asset.kind]}{!asset.currentVersionId ? ' · 候选预览' : ''}</Text>
  </Pressable>;
}
