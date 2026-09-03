import { bottomDistance, nextFollowState } from './timelineScroll';

const metrics = (y: number, viewport = 500, content = 1000) => ({ contentOffset: { y }, layoutMeasurement: { height: viewport }, contentSize: { height: content } });

test('treats positions within 48 px as bottom', () => {
  expect(bottomDistance(metrics(452))).toBe(48);
  expect(nextFollowState(true, { type: 'scroll', metrics: metrics(452) })).toBe(true);
  expect(nextFollowState(true, { type: 'scroll', metrics: metrics(451) })).toBe(false);
});

test('user drag disables follow until metrics return to bottom', () => {
  expect(nextFollowState(true, { type: 'drag-start' })).toBe(false);
  expect(nextFollowState(false, { type: 'scroll', metrics: metrics(100) })).toBe(false);
  expect(nextFollowState(false, { type: 'scroll-end', metrics: metrics(500) })).toBe(true);
});

test('explicit back-to-latest restores follow', () => {
  expect(nextFollowState(false, { type: 'back-to-latest' })).toBe(true);
});
