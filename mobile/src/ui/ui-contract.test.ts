import { APP_TABS, COLORS } from './theme';
import { ICON_NAMES } from './icons';

describe('native app shell contract', () => {
  it('keeps all five application destinations', () => {
    expect(APP_TABS).toHaveLength(5);
    expect(APP_TABS.map((tab) => tab.id)).toEqual(['create', 'agent', 'tasks', 'gallery', 'settings']);
  });

  it('provides readable text for light surfaces and filled primary buttons', () => {
    const luminance = (hex: string) => {
      const values = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    for (const [foreground, background] of [[COLORS.text, COLORS.background], [COLORS.textMuted, COLORS.surface], [COLORS.textSubtle, COLORS.surface], [COLORS.onPrimary, COLORS.primary], [COLORS.primaryActive, COLORS.primarySoft]]) {
      const a = luminance(foreground), b = luminance(background);
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uses a stable icon registry instead of a web font', () => {
    expect(ICON_NAMES).toEqual(expect.arrayContaining(['movie_filter', 'smart_toy', 'list_alt', 'grid_view', 'settings']));
  });
});
