import type { SQLiteDatabase } from 'expo-sqlite';
import { createMediaCommandService, type MediaCommandService } from '../workflows/executor/mediaCommandService';
import { createExecutorWakeRepository } from './executorWakeRepository';
import { executorWakePort } from './executorEvents';
import { taskProjectionEvents } from './taskProjectionEvents';

export type CommandReceipt = Readonly<{ status: 'accepted' | 'coalesced' | 'already-complete'; wakeGeneration: number; acceptedAt: number }>;

export function createTaskCommandService(options: {
  db: SQLiteDatabase; fileExists(uri: string): Promise<boolean>; resolveCasUri(path: string): string;
  now?: () => number; invalidate?: () => void; signal?: () => void;
}) {
  const now = options.now ?? Date.now;
  const execute = async (command?: (media: MediaCommandService) => ReturnType<MediaCommandService['requestDownload']>): Promise<CommandReceipt> => {
    let receipt!: CommandReceipt;
    await options.db.withExclusiveTransactionAsync(async db => {
      const result = command ? await command(createMediaCommandService({ ...options, db, insideTransaction: true })) : undefined;
      const acceptedAt = now();
      const wake = await createExecutorWakeRepository(db).requestWake(acceptedAt, command ? undefined : 'force-next-slice');
      receipt = { status: result?.status === 'already-complete' ? 'already-complete' : result?.status === 'in-flight' || (!command && wake.maintenanceGeneration < wake.generation) ? 'coalesced' : 'accepted', wakeGeneration: wake.generation, acceptedAt };
    });
    (options.invalidate ?? taskProjectionEvents.invalidate)();
    (options.signal ?? (() => executorWakePort.signal('command')))();
    return receipt;
  };
  return {
    requestRefresh: (_options: { maintenance: 'force-next-slice' }) => execute(),
    requestDownload: (taskId: string) => execute(media => media.requestDownload(taskId)),
    requestRedownload: (taskId: string) => execute(media => media.requestRedownload(taskId)),
    requestExport: (taskId: string, policy: { keepPrivateCopy: boolean }) => execute(media => media.requestExport(taskId, policy)),
  };
}
export type TaskCommandService = ReturnType<typeof createTaskCommandService>;
