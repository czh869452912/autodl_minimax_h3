export type SheetSnap = 'collapsed' | 'expanded' | 'closed';

export type BottomSheetRelease = {
  current: SheetSnap;
  translationY: number;
  velocityY: number;
  collapsedOffset: number;
  expandedOffset: number;
  closeOffset: number;
};

export function resolveBottomSheetRelease({
  current,
  translationY,
  velocityY,
  collapsedOffset,
  expandedOffset,
  closeOffset,
}: BottomSheetRelease): SheetSnap {
  const projectedDelta = translationY + velocityY * 0.2;
  if (current === 'collapsed' && projectedDelta >= closeOffset) return 'closed';
  const origin = current === 'expanded' ? expandedOffset : collapsedOffset;
  const projectedPosition = origin + projectedDelta;
  const midpoint = (collapsedOffset + expandedOffset) / 2;
  return projectedPosition <= midpoint ? 'expanded' : 'collapsed';
}
