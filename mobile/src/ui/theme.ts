export const COLORS = {
  background: '#020617',
  surface: '#0f172a',
  surfaceRaised: '#111c33',
  border: '#1e293b',
  text: '#f8fafc',
  textMuted: '#94a3b8',
  textSubtle: '#64748b',
  primary: '#4f46e5',
  primaryActive: '#818cf8',
  primarySoft: '#312e81',
  success: '#10b981',
  danger: '#ef4444',
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
