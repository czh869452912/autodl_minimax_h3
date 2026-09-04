import fs from 'fs';
import os from 'os';
import path from 'path';
import type { CasFiles } from '../../media/cas';
import { createArtifactCas } from '../../media/cas';
import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { ProviderError } from '../providers/autodl/client';
import type { QueueSubmissionInput } from '../runtime/runtime';
import { createDurableExecutor } from './durableExecutor';
import { createExecutorTick } from './tick';
import { createJobStateRepository } from './jobStateRepository';
import { createOperationRepository } from './operationRepository';

const acceptanceCase = process.env.C_CORE_RECOVERY_CASE;
const acceptancePhase = process.env.C_CORE_RECOVERY_PHASE;
const databasePath = process.env.C_CORE_RECOVERY_DB;
const counterPath = process.env.C_CORE_RECOVERY_COUNTER;
const capturePath = process.env.C_CORE_RECOVERY_CAPTURE;
const casRoot = process.env.C_CORE_RECOVERY_CAS;
const acceptanceTest = acceptanceCase && acceptancePhase && databasePath && counterPath && capturePath ? test : test.skip;

const workflow = { id: 'demo', version: '1.0.0', outputs: { artifacts: [] } } as never;
const draft = { workflowId: 'demo', workflowVersion: '1.0.0', contentHash: 'hash', inputs: { prompt: 'hello' } } as never;
const provenance = { workflowId: 'demo', workflowVersion: '1.0.0', contentHash: 'hash' };
const submission = (id: string): QueueSubmissionInput => ({ submissionId: id, workflow, draft, provenance });

function appendProviderCall(value: Record<string, unknown>): void {
  fs.appendFileSync(counterPath!, `${JSON.stringify(value)}${os.EOL}`);
}

function provider() {
  return {
    manifest: () => ({ id: 'demo', adapterVersion: '1.0.0' }),
    validateCredentials: jest.fn(async () => ({ ok: true })),
    submit: jest.fn(async () => {
      appendProviderCall({ operation: 'submit' });
      if (acceptanceCase === 'redaction') {
        throw new ProviderError('autodl', 'submit', 'timeout', 'Authorization: Bearer C_CORE_CANARY token=C_CORE_CANARY');
      }
      return { providerJobId: 'remote-process', opaque: 'opaque-process' };
    }),
    getStatus: jest.fn(async (handle: Record<string, unknown>) => {
      appendProviderCall({ operation: 'status', handle });
      return { status: 'RUNNING' as const, artifacts: [], rawStatus: 'running' };
    }),
  };
}

function openRuntime() {
  const db = createInitializedRealSqliteTestDb(databasePath!);
  const jobs = createJobStateRepository(db as never);
  const operations = createOperationRepository(db as never);
  const adapter = provider();
  const runtime = {
    prepareSubmission: jest.fn(() => ({
      workflowId: 'demo', workflowVersion: '1.0.0', workflowContentHash: 'hash', adapterId: 'demo', adapterVersion: '1.0.0',
      inputSnapshot: { prompt: 'hello' }, requestInput: { prompt: 'hello' }, outputMapping: { artifacts: [] },
      target: { operation: 'workflow.submit', workflowId: 'demo' },
    })),
    mapStatus: jest.fn((job, update) => ({ job: { ...job, status: update.status, updatedAt: 151 }, artifacts: [] })),
  };
  const service = createDurableExecutor({
    jobs, operations, runtime, adapters: new Map([['demo', adapter]]) as never,
    credentials: { get: jest.fn(async () => ({ ok: true })) }, now: () => acceptancePhase === 'seed' ? 100 : 151,
  });
  return { db, jobs, operations, service };
}

function rows(db: ReturnType<typeof createInitializedRealSqliteTestDb>) {
  return {
    operations: db.getAllSync('SELECT id,kind,state,attempt,lease_owner,lease_expires_at,last_error_json FROM workflow_operations ORDER BY id'),
    jobs: db.getAllSync('SELECT id,status,revision,provider_handle_json,last_error_json FROM workflow_jobs ORDER BY id'),
    events: db.getAllSync('SELECT job_id,sequence,event_type,payload_json FROM workflow_job_events ORDER BY job_id,sequence'),
  };
}

function capture(db: ReturnType<typeof createInitializedRealSqliteTestDb>): ReturnType<typeof rows> {
  const value = rows(db);
  fs.writeFileSync(capturePath!, JSON.stringify(value, null, 2));
  return value;
}

function calls(): Array<Record<string, unknown>> {
  if (!fs.existsSync(counterPath!)) return [];
  return fs.readFileSync(counterPath!, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function physicalFiles(root: string): CasFiles {
  const absolute = (relative: string) => path.join(root, ...relative.split('/'));
  return {
    makeDirectory: async (relative) => { await fs.promises.mkdir(absolute(relative), { recursive: true }); },
    async write(relative, chunk, append) {
      await fs.promises.mkdir(path.dirname(absolute(relative)), { recursive: true });
      if (append) await fs.promises.appendFile(absolute(relative), chunk);
      else await fs.promises.writeFile(absolute(relative), chunk);
    },
    async stat(relative) {
      try { return { exists: true, size: (await fs.promises.stat(absolute(relative))).size }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false }; throw error; }
    },
    move: async (from, to) => { await fs.promises.rename(absolute(from), absolute(to)); },
    copy: async (from, to) => { await fs.promises.copyFile(absolute(from), absolute(to)); },
    remove: async (relative) => { await fs.promises.rm(absolute(relative), { force: true }); },
    async *readChunks(relative) {
      const handle = await fs.promises.open(absolute(relative), 'r');
      try {
        const buffer = Buffer.alloc(64 * 1024);
        let position = 0;
        while (true) {
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
          if (bytesRead === 0) break;
          position += bytesRead;
          yield new Uint8Array(buffer.subarray(0, bytesRead));
        }
      } finally {
        await handle.close();
      }
    },
  };
}

acceptanceTest(`process recovery ${acceptanceCase ?? 'disabled'} ${acceptancePhase ?? 'disabled'}`, async () => {
  if (acceptanceCase === 'part') {
    if (!casRoot) throw new Error('C_CORE_RECOVERY_CAS is required for the part case');
    const files = physicalFiles(casRoot);
    if (acceptancePhase === 'seed') {
      const interrupted: CasFiles = {
        ...files,
        write: async (...args) => { await files.write(...args); throw new Error('process stopped'); },
        remove: async () => { throw new Error('process already gone'); },
      };
      await expect(createArtifactCas(interrupted).put(
        { async *[Symbol.asyncIterator]() { yield new TextEncoder().encode('interrupted'); } },
        { mime: 'video/mp4', maxBytes: 20, operationId: 'download-process', operationAttempt: 1 },
      )).rejects.toThrow('process stopped');
      expect(fs.readdirSync(path.join(casRoot, 'cas', 'parts'))).toHaveLength(1);
    } else {
      const stored = await createArtifactCas(files).put(
        { async *[Symbol.asyncIterator]() { yield new TextEncoder().encode('abc'); } },
        { mime: 'video/mp4', maxBytes: 10, operationId: 'download-process', operationAttempt: 2 },
      );
      expect(fs.readdirSync(path.join(casRoot, 'cas', 'parts'))).toEqual([]);
      expect(fs.readdirSync(path.join(casRoot, 'cas', 'sha256', stored.sha256.slice(0, 2)))).toEqual([stored.sha256]);
    }
    fs.writeFileSync(capturePath!, JSON.stringify({ case: 'part', phase: acceptancePhase }, null, 2));
    return;
  }

  const value = openRuntime();
  try {
    const jobId = `job:${acceptanceCase}-process`;
    if (acceptancePhase === 'seed') {
      const job = await value.service.queueSubmission(submission(`${acceptanceCase}-process`));
      if (acceptanceCase === 'unknown' || acceptanceCase === 'handle') {
        value.operations.claimDue({ kind: 'SUBMIT', owner: 'dead-process', now: 100, leaseMs: 50, limit: 1 });
        const started = value.jobs.transition({
          jobId: job.id, expectedRevision: job.revision, patch: { status: 'SUBMITTING', updatedAt: 100 },
          event: { id: `${job.id}:process:started`, type: 'SUBMIT_STARTED', payload: {}, createdAt: 100 },
        });
        if (!started.ok) throw new Error('failed to create process fixture');
        if (acceptanceCase === 'handle') {
          value.jobs.transition({
            jobId: job.id, expectedRevision: started.current.revision,
            patch: { status: 'QUEUED', providerHandle: { providerJobId: 'remote-original', opaque: 'opaque-original' }, updatedAt: 101 },
            event: { id: `${job.id}:process:handle`, type: 'SUBMIT_HANDLE_PERSISTED', payload: {}, createdAt: 101 },
          });
        }
      }
      expect(calls()).toEqual([]);
      capture(value.db);
      return;
    }

    const tick = createExecutorTick({ operations: value.operations, executor: value.service, owner: () => 'new-process', isReadonly: () => false, leaseMs: 50 });
    await tick.run({ reason: 'background', maxOperations: 4, now: 151 });
    const persisted = capture(value.db);
    if (acceptanceCase === 'pending') {
      expect(calls()).toEqual([{ operation: 'submit' }]);
      expect(value.jobs.get(jobId)).toMatchObject({ status: 'QUEUED', providerHandle: { providerJobId: 'remote-process' } });
    } else if (acceptanceCase === 'unknown') {
      expect(calls()).toEqual([]);
      expect(value.jobs.get(jobId)).toMatchObject({ status: 'UNKNOWN' });
      expect(value.operations.list('SUBMIT')).toMatchObject([{ state: 'BLOCKED', attempt: 1 }]);
    } else if (acceptanceCase === 'handle') {
      expect(calls()).toEqual([{ operation: 'status', handle: { providerJobId: 'remote-original', opaque: 'opaque-original' } }]);
      expect(value.operations.list('SUBMIT')).toMatchObject([{ state: 'SUCCEEDED', attempt: 1 }]);
    } else if (acceptanceCase === 'redaction') {
      expect(calls()).toEqual([{ operation: 'submit' }]);
      expect(JSON.stringify(persisted)).not.toContain('C_CORE_CANARY');
      expect(value.jobs.get(jobId)).toMatchObject({ status: 'UNKNOWN', lastError: { code: 'AUTODL_SUBMIT_TIMEOUT' } });
    } else {
      throw new Error(`unsupported C_CORE_RECOVERY_CASE: ${acceptanceCase}`);
    }
  } finally { value.db.close(); }
});
