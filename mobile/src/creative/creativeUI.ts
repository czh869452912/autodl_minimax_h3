import { StyleSheet } from 'react-native';
import { COLORS } from '../ui/theme';
export const creativeUI = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, gap: 16, paddingBottom: 32, width: '100%', maxWidth: 900, alignSelf: 'center' },
  heading: { color: COLORS.text, fontSize: 26, fontWeight: '700', flexShrink: 1 },
  title: { color: COLORS.text, fontSize: 18, fontWeight: '600', flexShrink: 1 },
  body: { color: COLORS.text, fontSize: 16, lineHeight: 24 },
  muted: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21 },
  error: { color: COLORS.danger, fontSize: 14, lineHeight: 21 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: COLORS.border },
  input: { borderWidth: 1, borderColor: COLORS.controlBorder, borderRadius: 12, padding: 12, minHeight: 48, color: COLORS.text, backgroundColor: COLORS.surface, fontSize: 16 },
  multiline: { minHeight: 130, textAlignVertical: 'top' },
  footer: { padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  preview: { width: '100%', height: 280, backgroundColor: COLORS.surfaceRaised, borderRadius: 12 },
});
