import { startForegroundExecutorScheduler } from './foregroundExecutorScheduler';
import { executorWakePort } from './executorEvents';

export function startForegroundTaskExecution() {
  const scheduler = startForegroundExecutorScheduler({ runner: {
    async runSlice(request) { const { executorRunner } = await import('./executorRuntime'); return executorRunner.runSlice(request); },
  } });
  executorWakePort.signal('foreground');
  return scheduler;
}
