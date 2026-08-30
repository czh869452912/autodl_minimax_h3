import { resolveBottomSheetRelease, type SheetSnap } from './draggableBottomSheet';

describe('draggable bottom sheet snap resolution', () => {
  const base = {
    current: 'collapsed' as SheetSnap,
    collapsedOffset: 500,
    expandedOffset: 80,
    closeOffset: 180,
  };

  it('expands after a deliberate upward drag or fling', () => {
    expect(resolveBottomSheetRelease({ ...base, translationY: -260, velocityY: 0 })).toBe('expanded');
    expect(resolveBottomSheetRelease({ ...base, translationY: -80, velocityY: -1200 })).toBe('expanded');
  });

  it('collapses from expanded when released downward without closing', () => {
    expect(resolveBottomSheetRelease({ ...base, current: 'expanded', translationY: 220, velocityY: 0 })).toBe('collapsed');
  });

  it('closes after pulling the compact sheet past the close threshold', () => {
    expect(resolveBottomSheetRelease({ ...base, translationY: 210, velocityY: 0 })).toBe('closed');
  });

  it('returns to the nearest snap point after a short release', () => {
    expect(resolveBottomSheetRelease({ ...base, translationY: -30, velocityY: 0 })).toBe('collapsed');
    expect(resolveBottomSheetRelease({ ...base, current: 'expanded', translationY: 30, velocityY: 0 })).toBe('expanded');
  });
});
