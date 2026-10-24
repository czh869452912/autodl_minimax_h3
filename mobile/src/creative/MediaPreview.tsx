import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { extractPoster } from '../native/media';
import { AppIcon } from '../ui/icons';
import { COLORS } from '../ui/theme';
import type { AssetVersion, CreativeAsset } from './types';

// Posters belong to immutable file versions. Share extraction across tiles and
// keep native decoders bounded when a gallery contains many videos.
const posters = new Map<string, Promise<string | undefined>>();
const waiting: Array<() => void> = [];
let extracting = 0;
function posterFor(uri: string, key: string) {
  const cacheKey = `${key}:${uri}`;
  const cached = posters.get(cacheKey);
  if (cached) return cached;
  const result = new Promise<string | undefined>(resolve => {
    const start = () => {
      extracting++;
      void extractPoster(uri, `creative-${key}`).then(resolve, () => resolve(undefined)).finally(() => {
        extracting--;
        waiting.shift()?.();
      });
    };
    if (extracting < 2) start(); else waiting.push(start);
  });
  posters.set(cacheKey, result);
  if (posters.size > 100) posters.delete(posters.keys().next().value!);
  return result;
}

export function MediaPreview({ version, kind = 'image', label, style, contain = false }: { version?: AssetVersion; kind?: CreativeAsset['kind']; label: string; style?: StyleProp<ViewStyle>; contain?: boolean }) {
  const uri = version?.state === 'AVAILABLE' && version.relativePath ? `${FileSystem.documentDirectory}${version.relativePath}` : undefined;
  const image = version?.mime?.startsWith('image/');
  const video = version?.mime?.startsWith('video/') || kind === 'video';
  const [poster, setPoster] = useState<{ source: string; uri?: string }>();
  const [failed, setFailed] = useState<string>();
  useEffect(() => {
    let active = true;
    if (video && uri && version) void posterFor(uri, version.blobSha256 ?? version.id).then(value => { if (active) setPoster({ source: uri, uri: value }); });
    return () => { active = false; };
  }, [uri, video, version?.id, version?.blobSha256]);
  const source = image ? uri : poster?.source === uri ? poster?.uri : undefined;
  return <View style={[styles.frame, style]}>
    {source && failed !== source ? <Image accessibilityLabel={label} source={{ uri: source }} onError={() => setFailed(source)} style={StyleSheet.absoluteFill} resizeMode={contain ? 'contain' : 'cover'} /> : <View accessibilityLabel={label} style={styles.placeholder}>
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
