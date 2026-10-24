export const COLORS = {
  background: '#f5f7f6',
  surface: '#ffffff',
  surfaceRaised: '#edf1f0',
  border: '#d7deda',
  controlBorder: '#78877f',
  text: '#1e2422',
  textMuted: '#58655e',
  textSubtle: '#58655e',
  primary: '#186f5d',
  primaryActive: '#126b58',
  primarySoft: '#e5f1ed',
  success: '#247449',
  successSoft: '#e7f3e9',
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
  controlLine: COLORS.controlBorder,
  accent: COLORS.primaryActive,
  success: COLORS.success,
  danger: COLORS.danger,
} as const;

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const APP_TABS = [
  { id: 'create', label: '手工工作台', icon: 'tune' },
  { id: 'agent', label: 'Agent 工作台', icon: 'smart_toy' },
] as const;

export type AppTabId = (typeof APP_TABS)[number]['id'] | 'projects' | 'assets' | 'tasks' | 'settings' | 'gallery';
