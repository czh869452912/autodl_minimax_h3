import { useWindowDimensions } from 'react-native';

// Page spacing and component reflow are separate from typography scaling.
export function isCompactLayout(width: number, fontScale: number): boolean {
  return width < 400 || fontScale > 1.15;
}

export function pageGutter(width: number): number {
  return width < 400 ? 12 : width < 600 ? 16 : 24;
}

export function galleryColumns(width: number, fontScale: number): number {
  const minimumCardWidth = 156 * Math.max(1, fontScale);
  return Math.max(1, Math.min(4, Math.floor((width + 13) / (minimumCardWidth + 13))));
}

export function usePageLayout(maxWidth = 760) {
  const window = useWindowDimensions();
  const gutter = pageGutter(window.width);
  return {
    ...window,
    gutter,
    compact: isCompactLayout(window.width, window.fontScale),
    contentStyle: { width: '100%' as const, maxWidth, alignSelf: 'center' as const, paddingHorizontal: gutter },
  };
}
