export const COLORS = {
  background: '#f5f7f6',
  surface: '#ffffff',
  surfaceRaised: '#edf1f0',
  border: '#d7deda',
  text: '#1e2422',
  textMuted: '#58655e',
  textSubtle: '#67746d',
  primary: '#186f5d',
  primaryActive: '#126b58',
  primarySoft: '#e5f1ed',
  success: '#247449',
  danger: '#b4403c',
  onPrimary: '#ffffff',
  warning: '#855b08',
  dangerSoft: '#fbecea',
  scrim: 'rgba(20,24,22,.36)',
  mediaBackground: '#101211',
  mediaOverlay: 'rgba(16,18,17,.85)',
} as const;

export const LIGHT_PROMPT_COLORS = {
  background: COLORS.background,
  surface: COLORS.surface,
  ink: COLORS.text,
  muted: COLORS.textMuted,
  placeholder: COLORS.textSubtle,
  line: COLORS.border,
  accent: COLORS.primaryActive,
  success: COLORS.success,
  danger: COLORS.danger,
} as const;

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const APP_TABS = [
  { id: 'create', label: '生成', icon: 'movie_filter' },
  { id: 'agent', label: 'Prompt助手', icon: 'smart_toy' },
  { id: 'tasks', label: '任务队列', icon: 'list_alt' },
  { id: 'gallery', label: '结果', icon: 'grid_view' },
  { id: 'settings', label: '设置', icon: 'settings' },
] as const;

export type AppTabId = (typeof APP_TABS)[number]['id'];
