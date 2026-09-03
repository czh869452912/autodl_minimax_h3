import { createPromptDraftStore } from '../agent/promptDraft';
import { createLocalThreadStore } from '../agent/threadStore';
import { createJobRepository } from '../jobs/repository';
import { createSqliteMediaStore } from '../media/repository';
import { createTaskRepository } from '../tasks/repository';
import { withSchedulerLease } from '../tasks/scheduler';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createWorkflowRegistry } from '../workflows/registry/repository';
import { markRecovery } from './recovery';

test('all app repositories reject writes in recovery mode', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    markRecovery(db as never, 'MIGRATION_5_TO_6_FAILED', 1);
    const tasks = createTaskRepository(db as never);
    const media = createSqliteMediaStore(db as never);
    const jobs = createJobRepository(db as never);
    const drafts = createPromptDraftStore(db as never);
    const threads = createLocalThreadStore(db as never);
    const registry = createWorkflowRegistry(db as never);

    await expect(tasks.list()).resolves.toEqual([]);
    await expect(media.list()).resolves.toEqual([]);
    await expect(jobs.list()).resolves.toEqual([]);
    await expect(drafts.read('missing')).resolves.toBeNull();
    await expect(threads.list()).resolves.toEqual([]);
    await expect(registry.list()).resolves.toEqual([]);

    await expect(tasks.upsert({ id: 't', prompt: 'p', status: 'QUEUED', resolution: '768p', duration: 5, createdAt: 1, updatedAt: 1 })).rejects.toThrow('APP_DATABASE_READ_ONLY');
    await expect(media.upsert({ id: 'm', taskId: 't', title: 'x', prompt: 'p', sourceUrl: 'https://example.test/x', mimeType: 'video/mp4', status: 'downloading', kind: 'video', createdAt: 1, updatedAt: 1 })).rejects.toThrow('APP_DATABASE_READ_ONLY');
    await expect(jobs.upsert({ id: 'j', workflowId: 'w', workflowVersion: '1', workflowContentHash: 'h', adapterId: 'a', adapterVersion: '1', inputSnapshot: {}, status: 'QUEUED', createdAt: 1, updatedAt: 1 })).rejects.toThrow('APP_DATABASE_READ_ONLY');
    await expect(drafts.save({ prompt: 'p', attachmentIds: [] })).rejects.toThrow('APP_DATABASE_READ_ONLY');
    await expect(threads.save({ threadId: 'th', messages: [], state: {}, createdAt: 1, updatedAt: 1 })).rejects.toThrow('APP_DATABASE_READ_ONLY');
    await expect(registry.upsert({ workflowId: 'w', version: '1', contentHash: 'h', source: 'builtin', trust: 'builtin', definitionJson: '{}', installedAt: 1 })).rejects.toThrow('APP_DATABASE_READ_ONLY');
    await expect(withSchedulerLease('status', async () => true, { db: db as never })).rejects.toThrow('APP_DATABASE_READ_ONLY');
  } finally {
    db.close();
  }
});
