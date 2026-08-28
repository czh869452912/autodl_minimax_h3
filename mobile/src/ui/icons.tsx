import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export const ICON_NAMES = [
  'movie_filter', 'list_alt', 'grid_view', 'settings',
  'add_photo_alternate', 'library_music', 'close', 'delete', 'play_arrow',
  'pause', 'search', 'filter_list', 'download', 'refresh', 'info', 'bolt', 'add', 'send', 'auto_awesome', 'key', 'smart_toy', 'save', 'content_copy',
] as const;
export type IconName = (typeof ICON_NAMES)[number];

const ICON_MAP: Record<IconName, ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  movie_filter: 'movie-open-outline',
  smart_toy: 'robot-outline',
  list_alt: 'format-list-bulleted-square',
  grid_view: 'view-grid-outline',
  settings: 'cog-outline',
  add_photo_alternate: 'image-plus',
  library_music: 'music-note-plus',
  close: 'close',
  delete: 'delete-outline',
  play_arrow: 'play',
  pause: 'pause',
  search: 'magnify',
  filter_list: 'filter-variant',
  download: 'download-outline',
  refresh: 'refresh',
  info: 'information-outline',
  bolt: 'flash-outline',
  add: 'plus',
  send: 'send',
  auto_awesome: 'creation-outline',
  key: 'key-outline',
  save: 'content-save-outline',
  content_copy: 'content-copy',
};

export function AppIcon({ name, size = 24, color = '#94a3b8' }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={ICON_MAP[name]} size={size} color={color} />;
}
