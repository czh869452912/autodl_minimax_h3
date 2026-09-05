import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createTaskCommandService } from './taskCommandService';

test('command receipt observes atomic intent, projection and wake before returning without a worker', async () => {
  const db = createInitializedRealSqliteTestDb();
  db.runSync("INSERT INTO tasks(id,prompt,status,resolution,duration,video_url,created_at,updated_at) VALUES('a','p','SUCCESS','720p',5,'https://cdn.example/v',1,1)");
  db.runSync("INSERT INTO media_assets(id,task_id,title,prompt,source_url,mime_type,status,created_at,updated_at,kind) VALUES('a:v','a','p','p','https://cdn.example/v','video/mp4','failed',1,1,'video')");
  let observed: unknown;
  const commands = createTaskCommandService({ db: db as never, now: () => 100, fileExists: async () => false, resolveCasUri: p => p,
    invalidate: () => { observed = db.getFirstSync('SELECT download_state,(SELECT generation FROM executor_wake_state) AS generation FROM tasks'); }, signal: () => undefined });
  try {
    expect(await commands.requestDownload('a')).toEqual({ status: 'accepted', wakeGeneration: 1, acceptedAt: 100 });
    expect(observed).toEqual({ download_state: 'ENQUEUED', generation: 1 });
    expect(await commands.requestDownload('a')).toMatchObject({ status: 'coalesced', wakeGeneration: 2 });
    expect(db.getAllSync('SELECT * FROM workflow_operations')).toHaveLength(1);
    const before = db.getFirstSync('SELECT * FROM tasks');
    await commands.requestRefresh({ maintenance: 'force-next-slice' });
    await commands.requestRefresh({ maintenance: 'force-next-slice' });
    expect(db.getFirstSync('SELECT * FROM tasks')).toEqual(before);
    expect(db.getFirstSync('SELECT generation,maintenance_generation FROM executor_wake_state')).toEqual({ generation: 4, maintenance_generation: 3 });
    db.execSync("CREATE TRIGGER reject_wake BEFORE UPDATE ON executor_wake_state BEGIN SELECT RAISE(ABORT,'wake failed'); END");
    await expect(commands.requestRedownload('a')).rejects.toThrow('wake failed');
    expect(db.getFirstSync('SELECT * FROM tasks')).toEqual(before);
  } finally { db.close(); }
});
