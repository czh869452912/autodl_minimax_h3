export type TimelineMetrics = { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } };
export type FollowEvent =
  | { type: 'drag-start' }
  | { type: 'scroll' | 'scroll-end'; metrics: TimelineMetrics }
  | { type: 'back-to-latest' };

export const FOLLOW_BOTTOM_THRESHOLD = 48;

export function bottomDistance(metrics: TimelineMetrics): number {
  return Math.max(metrics.contentSize.height - metrics.layoutMeasurement.height - metrics.contentOffset.y, 0);
}

export function nextFollowState(current: boolean, event: FollowEvent): boolean {
  if (event.type === 'drag-start') return false;
  if (event.type === 'back-to-latest') return true;
  return bottomDistance(event.metrics) <= FOLLOW_BOTTOM_THRESHOLD;
}
