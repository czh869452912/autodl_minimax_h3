import { StyleSheet } from 'react-native';
import { COLORS } from '../ui/theme';
export const creativeUI = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, gap: 14, paddingBottom: 24, width: '100%', maxWidth: 900, alignSelf: 'center' },
  heading: { color: COLORS.text, fontSize: 22, fontWeight: '700', flexShrink: 1 },
  title: { color: COLORS.text, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  body: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  muted: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21 },
  error: { color: COLORS.danger, fontSize: 14, lineHeight: 21 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  card: { backgroundColor: COLORS.surface, borderRadius: 8, padding: 12, gap: 10, borderWidth: 1, borderColor: COLORS.border },
  input: { borderWidth: 1, borderColor: COLORS.controlBorder, borderRadius: 6, padding: 9, minHeight: 44, color: COLORS.text, backgroundColor: COLORS.surface, fontSize: 14 },
  multiline: { minHeight: 130, textAlignVertical: 'top' },
  footer: { paddingHorizontal: 20, paddingVertical: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  preview: { width: '100%', height: 280, backgroundColor: COLORS.surfaceRaised, borderRadius: 12 },
});
