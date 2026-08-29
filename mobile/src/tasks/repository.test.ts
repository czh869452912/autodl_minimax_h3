import { createTaskRepository } from './repository';
import type { TaskRecord } from './types';

function fakeDb() {
  let row: Record<string, unknown> | undefined;
  return {
    execSync: () => undefined,
    runSync: (sql: string, ...params: unknown[]) => {
      if (sql.startsWith('INSERT')) row = {
        id: params[0], prompt: params[1], status: params[2], resolution: params[3], duration: params[4],
        seed: params[5], images_json: params[6], audios_json: params[7], video_url: params[8], local_uri: params[9],
        thumbnail_url: params[10], download_state: params[11], download_error: params[12], download_progress: params[13],
        created_at: params[14], updated_at: params[15], started_at: params[16], execution_duration: params[17],
      };
    },
    getAllSync: <T>() => row ? [row as T] : [],
  };
}

test('persists provider start time and execution duration', async () => {
  const store = createTaskRepository(fakeDb() as never);
  const task: TaskRecord = {
    id: 'task-1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5,
    createdAt: 1_000, updatedAt: 2_000, startedAt: 1_500, executionDuration: 42,
  };
  await store.upsert(task);
  expect((await store.list())[0]).toMatchObject({ startedAt: 1_500, executionDuration: 42 });
});
