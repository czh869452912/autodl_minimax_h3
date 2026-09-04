import { projectTerminalNotifications } from './terminalEvents';

test('projects short safe notification copy without task payload data', () => {
  const events = projectTerminalNotifications([
    { eventId: 'e1', taskId: 'task-1', status: 'SUCCESS', createdAt: 1 },
    { eventId: 'e2', taskId: 'task-2', status: 'PARTIAL_SUCCESS', createdAt: 2 },
    { eventId: 'e3', taskId: 'task-3', status: 'FAILED', createdAt: 3 },
    { eventId: 'e4', taskId: 'task-4', status: 'CANCELLED', createdAt: 4 },
  ]);
  expect(events.map(({ title, body }) => ({ title, body }))).toEqual([
    { title: '任务已完成', body: '视频生成任务已成功完成' },
    { title: '任务部分完成', body: '视频生成任务已有部分结果' },
    { title: '任务失败', body: '视频生成任务未能完成' },
    { title: '任务已取消', body: '视频生成任务已取消' },
  ]);
  expect(JSON.stringify(events)).not.toContain('http');
  expect(JSON.stringify(events)).not.toContain('prompt');
  expect(JSON.stringify(events)).not.toContain('token');
});
