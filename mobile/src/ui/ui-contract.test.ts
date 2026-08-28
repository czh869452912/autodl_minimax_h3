import { APP_TABS } from './theme';
import { ICON_NAMES } from './icons';

describe('native app shell contract', () => {
  it('keeps the dark visual hierarchy from the release baseline', () => {
    expect(APP_TABS).toHaveLength(5);
    expect(APP_TABS.map((tab) => tab.id)).toEqual(['create', 'agent', 'tasks', 'gallery', 'settings']);
  });

  it('uses a stable icon registry instead of a web font', () => {
    expect(ICON_NAMES).toEqual(expect.arrayContaining(['movie_filter', 'smart_toy', 'list_alt', 'grid_view', 'settings']));
  });
});
