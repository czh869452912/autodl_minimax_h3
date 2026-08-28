import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export const ICON_NAMES = ['movie_filter', 'smart_toy', 'list_alt', 'grid_view', 'settings'] as const;
export type IconName = (typeof ICON_NAMES)[number];

const ICON_MAP: Record<IconName, ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  movie_filter: 'movie-open-outline',
  smart_toy: 'robot-outline',
  list_alt: 'format-list-bulleted-square',
  grid_view: 'view-grid-outline',
  settings: 'cog-outline',
};

export function AppIcon({ name, size = 24, color = '#94a3b8' }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={ICON_MAP[name]} size={size} color={color} />;
}
