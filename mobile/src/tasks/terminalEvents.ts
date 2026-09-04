export type TerminalTaskStatus = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'CANCELLED';

export type TerminalTaskEvent = {
  eventId: string;
  taskId: string;
  status: TerminalTaskStatus;
  createdAt: number;
};

export type TerminalNotification = TerminalTaskEvent & { title: string; body: string };

const COPY: Record<TerminalTaskStatus, { title: string; body: string }> = {
  SUCCESS: { title: '任务已完成', body: '视频生成任务已成功完成' },
  PARTIAL_SUCCESS: { title: '任务部分完成', body: '视频生成任务已有部分结果' },
  FAILED: { title: '任务失败', body: '视频生成任务未能完成' },
  CANCELLED: { title: '任务已取消', body: '视频生成任务已取消' },
};

export function projectTerminalNotifications(events: TerminalTaskEvent[]): TerminalNotification[] {
  return events.map((event) => ({ ...event, ...COPY[event.status] }));
}
