import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { openNativeVideo } from '../native/media';
import { AppIcon } from '../ui/icons';
import { COLORS } from '../ui/theme';

export function VideoPlayer({ source, poster }: { source: string; poster?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="打开原生视频播放器" onPress={() => openNativeVideo(source)} style={styles.container}>{poster ? <Image source={{ uri: poster }} style={styles.poster} resizeMode="cover" /> : <View style={styles.posterFallback} />}<View style={styles.overlay}><View style={styles.play}><AppIcon name="play_arrow" size={34} color={COLORS.text} /></View><Text style={styles.hint}>点击打开 Media3 播放器</Text></View></Pressable>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }, poster: { ...StyleSheet.absoluteFill, width: undefined, height: undefined }, posterFallback: { ...StyleSheet.absoluteFill, backgroundColor: '#111827' }, overlay: { alignItems: 'center', gap: 8 }, play: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#00000099', alignItems: 'center', justifyContent: 'center' }, hint: { color: '#ffffffcc', fontSize: 12 } });
