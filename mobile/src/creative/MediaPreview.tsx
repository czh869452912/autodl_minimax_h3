import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {previewQueue} from './previewQueue';
import { createImageThumbnail, extractPoster } from '../native/media';
import { AppIcon } from '../ui/icons';
import { COLORS } from '../ui/theme';
import type { AssetVersion, CreativeAsset } from './types';

export function MediaPreview({ version, kind = 'image', label, style, contain = false }: { version?: AssetVersion; kind?: CreativeAsset['kind']; label: string; style?: StyleProp<ViewStyle>; contain?: boolean }) {
  const uri = version?.state === 'AVAILABLE' && version.relativePath ? `${FileSystem.documentDirectory}${version.relativePath}` : undefined;
  const image = version?.mime?.startsWith('image/');
  const video = version?.mime?.startsWith('video/') || kind === 'video';
  const [poster, setPoster] = useState<{ source: string; uri?: string }>();
  const [failed, setFailed] = useState<string>();
  const [retry,setRetry]=useState(0);
  const previewKey=`${video?'video':'image'}:${version?.blobSha256??version?.id}:${uri}`;
  useEffect(()=>{setRetry(0);setFailed(undefined);},[previewKey]);
  useEffect(() => {
    let active = true;
    if(!uri||!version||!video&&!image)return;
    const request=previewQueue.request(previewKey,()=>video?extractPoster(uri,`creative-preview:${version.blobSha256??version.id}`):createImageThumbnail(uri,version.blobSha256??version.id));
    void request.promise.then(value=>{if(active){setPoster({source:uri,uri:value});setFailed(undefined);}});
    return () => { active = false;request.release(); };
  }, [uri, video,image,previewKey,retry]);
  const source = poster?.source === uri ? poster?.uri : undefined;
  return <View style={[styles.frame, style]}>
    {source && failed !== source ? <Image accessibilityLabel={label} source={{ uri: source }} resizeMethod="resize" onError={() => {setFailed(source);previewQueue.invalidate(previewKey);if(retry===0){setPoster(undefined);setRetry(1);}}} style={StyleSheet.absoluteFill} resizeMode={contain ? 'contain' : 'cover'} /> : <View accessibilityLabel={label} style={styles.placeholder}>
      <AppIcon name={video ? 'movie_filter' : kind === 'audio' ? 'library_music' : kind === 'document' || kind === 'prompt' ? 'list_alt' : 'add_photo_alternate'} size={28} color={COLORS.textMuted} />
      <Text style={styles.placeholderText}>{version?.state === 'MISSING' ? '原文件待恢复' : video ? '视频预览' : kind === 'audio' ? '音频' : kind === 'document' || kind === 'prompt' ? '文档' : '画面待创作'}</Text>
    </View>}
    {video ? <View style={styles.play}><AppIcon name="play_arrow" size={17} color={COLORS.onPrimary} /></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.surfaceRaised },
  placeholder: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8 },
  placeholderText: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center' },
  play: { position: 'absolute', right: 8, bottom: 8, borderRadius: 20, padding: 5, backgroundColor: COLORS.mediaOverlay },
});
