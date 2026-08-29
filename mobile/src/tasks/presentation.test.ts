import { formatTaskCreatedAt, formatTaskStatus, getTaskTiming } from './presentation';
import type { TaskRecord } from './types';

const baseTask: TaskRecord = {
  id: 'task-1', prompt: 'x', status: 'QUEUED', resolution: '768p竖', duration: 5,
  createdAt: 1_000_000, updatedAt: 1_000_000,
};

test('labels provider task states in Chinese', () => {
  expect(formatTaskStatus('QUEUED')).toBe('排队中');
  expect(formatTaskStatus('RUNNING')).toBe('执行中');
  expect(formatTaskStatus('SUCCESS')).toBe('成功');
});

test('calculates live queue and running durations from task timestamps', () => {
  expect(getTaskTiming({ ...baseTask, status: 'QUEUED' }, 1_125_000)).toMatchObject({
    queued: '2分05秒', running: '—',
  });
  expect(getTaskTiming({ ...baseTask, status: 'RUNNING', startedAt: 1_060_000, executionDuration: 10 }, 1_125_000)).toMatchObject({
    queued: '1分00秒', running: '1分05秒',
  });
});

test('uses provider execution duration after task completion', () => {
  expect(getTaskTiming({ ...baseTask, status: 'SUCCESS', startedAt: 1_060_000, executionDuration: 196 }, 9_999_999)).toMatchObject({
    running: '3分16秒',
  });
});

test('does not invent queue time and freezes terminal execution time when provider timing is incomplete', () => {
  expect(getTaskTiming({ ...baseTask, status: 'SUCCESS' }, 9_999_999)).toMatchObject({
    queued: '—', running: '—',
  });
  expect(getTaskTiming({ ...baseTask, status: 'FAILED', startedAt: 1_060_000, updatedAt: 1_125_000 }, 9_999_999)).toMatchObject({
    running: '1分05秒',
  });
});

test('formats task creation time for the queue card', () => {
  expect(formatTaskCreatedAt(Date.parse('2026-08-14T10:35:28+08:00'))).toMatch(/^2026\/08\/14 \d{2}:\d{2}:\d{2}$/);
});
