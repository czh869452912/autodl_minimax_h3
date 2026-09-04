import { nextPollDelay } from './pollSchedule';

test('schedules due work at the minimum delay', () => {
  expect(nextPollDelay({ now: 1_000, hasActiveTasks: false, remainingDue: 1 })).toBe(250);
  expect(nextPollDelay({ now: 1_000, hasActiveTasks: false, remainingDue: 1, nextWakeAt: 900 })).toBe(250);
});

test('caps active provider polling at ten seconds', () => {
  expect(nextPollDelay({ now: 1_000, hasActiveTasks: true, remainingDue: 0 })).toBe(10_000);
  expect(nextPollDelay({ now: 1_000, hasActiveTasks: true, remainingDue: 0, nextWakeAt: 61_000 })).toBe(10_000);
});

test('aligns inactive scheduled work to its exact wake time', () => {
  expect(nextPollDelay({ now: 1_000, hasActiveTasks: false, remainingDue: 0, nextWakeAt: 61_000 })).toBe(60_000);
  expect(nextPollDelay({ now: 1_000, hasActiveTasks: false, remainingDue: 0, nextWakeAt: 1_100 })).toBe(250);
});

test('stops timers when no task or operation needs work', () => {
  expect(nextPollDelay({ now: 1_000, hasActiveTasks: false, remainingDue: 0 })).toBeUndefined();
});
