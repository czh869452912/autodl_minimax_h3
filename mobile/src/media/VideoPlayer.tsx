import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

export function VideoPlayer({ source, poster }: { source: string; poster?: string }) {
  const player = useVideoPlayer(source || null, (instance) => { instance.muted = false; });
  if (!source) return <View style={styles.empty}><Text style={styles.text}>视频源不可用</Text></View>;
  return <View style={styles.wrap}>{poster ? <Image source={{ uri: poster }} style={styles.video} resizeMode="contain" /> : null}<VideoView player={player} nativeControls contentFit="contain" useExoShutter style={styles.video} /></View>;
}
const styles = StyleSheet.create({ wrap: { flex: 1, backgroundColor: '#000' }, video: { position: 'absolute', inset: 0, backgroundColor: '#000' }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center' }, text: { color: '#94a3b8' } });
