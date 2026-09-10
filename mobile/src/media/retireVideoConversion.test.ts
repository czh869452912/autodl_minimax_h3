import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { retireVideoConversion } from './retireVideoConversion';

test.each([true, false])('retire conversion, repair only an existing original (exists=%s), remain idempotent', async exists => {
  const db = createInitializedRealSqliteTestDb();
  const hash = 'a'.repeat(64);
  const path = `cas/sha256/aa/${hash}`;
  const uri = `file:///documents/${path}`;
  try {
    db.runSync("INSERT INTO tasks(id,prompt,status,resolution,duration,download_state,download_error,created_at,updated_at) VALUES('j','p','SUCCESS','768p',10,'DOWNLOAD_FAILED','ARTIFACT_COMPATIBILITY_FAILED',1,1)");
    db.runSync("INSERT INTO media_assets(id,task_id,title,prompt,source_url,mime_type,status,created_at,updated_at,job_id,artifact_id,kind,poster_path) VALUES('j:v','j','p','p','https://expired.example/v.mp4','video/mp4','failed',1,1,'j','v','video','file:///old.jpg')");
    db.runSync('INSERT INTO artifact_blobs VALUES(?,?,?,?,?,?)', hash, 100, 'video/mp4', path, 1, 1);
    db.runSync("INSERT INTO artifact_blob_refs VALUES(?,'workflow_artifact_original','j:v',1)", hash);
    db.runSync("INSERT INTO workflow_operations(id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES('c','ARTIFACT_DOWNLOAD','j','c',?,'PENDING',1,1,1,1)", JSON.stringify({ compatibilityOnly: true, artifact: { id: 'v' } }));
    const options = { now: 10, resolveUri: (path: string) => `file:///documents/${path}`, fileExists: async () => exists };
    await retireVideoConversion(db as never, options);
    expect(db.getFirstSync<{ state: string }>('SELECT state FROM workflow_operations')?.state).toBe('FAILED');
    expect(db.getFirstSync<{ local_uri: string | null }>('SELECT local_uri FROM tasks')?.local_uri).toBe(exists ? uri : null);
    if (exists) expect(db.getFirstSync('SELECT status,poster_path FROM media_assets')).toEqual({ status: 'downloaded', poster_path: null });
    await retireVideoConversion(db as never, { ...options, now: 20 });
    expect(db.getFirstSync<{ updated_at: number }>('SELECT updated_at FROM workflow_operations')?.updated_at).toBe(10);
    expect(db.getAllSync('SELECT * FROM artifact_blob_refs')).toHaveLength(1);
  } finally { db.close(); }
});
