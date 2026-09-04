export function nextPollDelay(options: {
  now: number;
  hasActiveTasks: boolean;
  nextWakeAt?: number;
  remainingDue: number;
}): number | undefined {
  const minimumDelay = 250;
  if (options.remainingDue > 0) return minimumDelay;
  const scheduledDelay = options.nextWakeAt == null
    ? undefined
    : Math.max(minimumDelay, options.nextWakeAt - options.now);
  if (options.hasActiveTasks) return Math.min(10_000, scheduledDelay ?? 10_000);
  return scheduledDelay;
}
