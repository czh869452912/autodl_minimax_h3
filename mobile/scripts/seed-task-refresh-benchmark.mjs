import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, openSync, closeSync, writeSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { V5_SCHEMA_STATEMENTS, V6_SCHEMA_STATEMENTS, V7_SCHEMA_STATEMENTS } from '../src/storage/schema.ts';

// Use an explicit output directory; fixtures are intentionally outside version control.
const directory = resolve(process.argv[2] ?? '../.superpowers/task-refresh-benchmark');
mkdirSync(directory, { recursive: true });
const databasePath = resolve(directory, 'task-refresh-v7.db');
const videoPath = resolve(directory, 'task-refresh-128MiB.mp4');
const db = new DatabaseSync(databasePath);
if (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length) throw new Error('Output database already exists; choose a fresh directory');
for (const sql of [...V5_SCHEMA_STATEMENTS, ...V6_SCHEMA_STATEMENTS, ...V7_SCHEMA_STATEMENTS]) db.exec(sql);
for (const [column, type] of [['revision', 'INTEGER NOT NULL DEFAULT 0'], ['provider_handle_json', 'TEXT'], ['last_error_json', 'TEXT'], ['next_sync_at', 'INTEGER']]) db.exec(`ALTER TABLE workflow_jobs ADD COLUMN ${column} ${type}`);
db.exec('ALTER TABLE workflow_registry ADD COLUMN hash_scheme TEXT; PRAGMA user_version=7; BEGIN');
const timestamp = 1788566400000;
const media = JSON.stringify(Array.from({ length: 40 }, (_, n) => ({ uri: `file:///fixtures/image-${n}.jpg`, name: `image-${n}.jpg`, mimeType: 'image/jpeg', metadata: 'm'.repeat(256) })));
const task = db.prepare('INSERT INTO tasks(id,prompt,status,resolution,duration,images_json,audios_json,input_json,created_at,updated_at,download_state,export_state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
const job = db.prepare('INSERT INTO workflow_jobs(id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
const operation = db.prepare("INSERT INTO workflow_operations(id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES(?,'STATUS_SYNC',?,?,?,'PENDING',0,?,?,?)");
for (let n = 0; n < 1000; n++) {
  const id = `benchmark-${String(n).padStart(4, '0')}`;
  const active = n < 50;
  const inputs = JSON.stringify({ prompt: `Benchmark task ${n}: ` + 'A detailed deterministic video prompt. '.repeat(900), resolution: '720p', duration: 5, images: JSON.parse(media) });
  task.run(id, `Benchmark task ${n}`, active ? 'RUNNING' : 'SUCCESS', '720p', 5, media, media, inputs, timestamp + n, timestamp + n, active ? 'IDLE' : 'DOWNLOADED', active ? 'NOT_REQUESTED' : 'EXPORTED');
  job.run(id, 'benchmark', '1', 'benchmark-hash', 'benchmark', '1', inputs, active ? 'RUNNING' : 'SUCCEEDED', timestamp + n, timestamp + n);
  if (n < 20) operation.run(`${id}:status`, id, `${id}:status`, '{}', n < 10 ? 0 : timestamp + 86400000 + n * 1000, timestamp, timestamp);
}
db.exec('COMMIT; VACUUM');
const counts = db.prepare("SELECT COUNT(*) AS tasks,SUM(status='RUNNING') AS active,SUM(status='SUCCESS') AS terminal,(SELECT COUNT(*) FROM workflow_operations WHERE state='PENDING') AS pending FROM tasks").get();
db.close();
const ffmpeg = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=24:d=2', '-an', '-c:v', 'libx264', '-threads', '1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-map_metadata', '-1', '-movflags', '+faststart', '-y', videoPath], { encoding: 'utf8' });
if (ffmpeg.status !== 0) throw new Error(`ffmpeg failed: ${ffmpeg.stderr}`);
// A valid ISO-BMFF free atom pads a real playable video to exactly 128 MiB.
const padding = 128 * 1024 * 1024 - statSync(videoPath).size;
const fd = openSync(videoPath, 'a');
const header = Buffer.alloc(8); header.writeUInt32BE(padding); header.write('free', 4); writeSync(fd, header);
const zeros = Buffer.alloc(1024 * 1024);
for (let left = padding - 8; left > 0; left -= Math.min(left, zeros.length)) writeSync(fd, zeros.subarray(0, Math.min(left, zeros.length)));
closeSync(fd);
async function sha256(path) { const hash = createHash('sha256'); for await (const bytes of createReadStream(path)) hash.update(bytes); return hash.digest('hex'); }
console.log(JSON.stringify({ databasePath, counts, databaseSha256: await sha256(databasePath), videoPath, videoBytes: statSync(videoPath).size, videoSha256: await sha256(videoPath) }, null, 2));
