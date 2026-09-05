import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createExecutorWakeRepository } from './executorWakeRepository';

test('atomic wakes preserve a newer generation and coalesce maintenance through acknowledgement', async () => {
  const db = createInitializedRealSqliteTestDb();
  const wakes = createExecutorWakeRepository(db as never);
  try {
    await Promise.all(Array.from({ length: 10 }, () => wakes.requestWake(100, 'force-next-slice')));
    expect(await wakes.read()).toMatchObject({ generation: 10, handledGeneration: 0, maintenanceGeneration: 1 });
    await wakes.acknowledge(5);
    expect(await wakes.read()).toMatchObject({ generation: 10, handledGeneration: 5 });
    await wakes.requestWake(200, 'force-next-slice');
    await wakes.acknowledge(10);
    expect(await wakes.read()).toMatchObject({ generation: 11, handledGeneration: 10, maintenanceGeneration: 11 });
  } finally { db.close(); }
});
