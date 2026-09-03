import type { JobRecord } from '../../jobs/types';
import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createOperationRepository } from './operationRepository';
import { createJobStateRepository } from './jobStateRepository';

const job: JobRecord = {
  id: 'job-1', revision: 0, workflowId: 'demo', workflowVersion: '1.0.0', workflowContentHash: 'hash',
  adapterId: 'demo', adapterVersion: '1.0.0', inputSnapshot: { prompt: 'x' }, status: 'READY_TO_SUBMIT',
  createdAt: 100, updatedAt: 100,
};

const initialEvent = { id: 'event-0', type: 'VALIDATED', payload: {}, createdAt: 100 };
const submitOperation = {
  id: 'submit-1', kind: 'SUBMIT' as const, jobId: 'job-1', idempotencyKey: 'submit:job-1',
  payload: { jobId: 'job-1' }, now: 100,
};
const acceptedTransition = {
  jobId: 'job-1',
  expectedRevision: 0,
  patch: { status: 'QUEUED' as const, providerHandle: { providerJobId: 'remote-1' }, updatedAt: 200 },
  event: { id: 'event-1', type: 'SUBMIT_ACCEPTED', payload: { providerJobId: 'remote-1' }, createdAt: 200 },
  nextOperations: [{
    id: 'status-1', kind: 'STATUS_SYNC' as const, jobId: 'job-1',
    idempotencyKey: 'status:job-1:1', payload: { jobId: 'job-1' }, now: 200,
  }],
};

function setup() {
  const db = createInitializedRealSqliteTestDb();
  const jobs = createJobStateRepository(db as never);
  const operations = createOperationRepository(db as never);
  return { db, jobs, operations };
}

test('creates the initial snapshot, sequence-zero event, and submit operation atomically', () => {
  const { db, jobs, operations } = setup();
  try {
    expect(jobs.createWithEventAndOperation(job, initialEvent, submitOperation)).toMatchObject({ id: 'job-1', revision: 0 });
    expect(jobs.listEvents('job-1')).toMatchObject([{ sequence: 0, type: 'VALIDATED' }]);
    expect(operations.get('submit-1')).toMatchObject({ kind: 'SUBMIT', state: 'PENDING' });
    expect(jobs.createWithEventAndOperation({ ...job, status: 'FAILED' }, { ...initialEvent, id: 'other-event' }, { ...submitOperation, id: 'other-submit' }))
      .toMatchObject({ id: 'job-1', status: 'READY_TO_SUBMIT' });
    expect(jobs.listEvents('job-1')).toHaveLength(1);
    expect(operations.list('SUBMIT')).toHaveLength(1);
  } finally { db.close(); }
});

test('updates snapshot, appends event, and enqueues next work atomically', () => {
  const { db, jobs, operations } = setup();
  try {
    jobs.createWithEventAndOperation(job, initialEvent, submitOperation);
    const result = jobs.transition(acceptedTransition);
    expect(result.ok).toBe(true);
    expect(jobs.get('job-1')).toMatchObject({ revision: 1, status: 'QUEUED', providerHandle: { providerJobId: 'remote-1' } });
    expect(jobs.listEvents('job-1')).toMatchObject([
      { sequence: 0, type: 'VALIDATED' },
      { sequence: 1, type: 'SUBMIT_ACCEPTED' },
    ]);
    expect(operations.get('status-1')).toMatchObject({ kind: 'STATUS_SYNC' });
  } finally { db.close(); }
});

test('returns current snapshot on CAS conflict without duplicate effects', () => {
  const { db, jobs, operations } = setup();
  try {
    jobs.createWithEventAndOperation(job, initialEvent, submitOperation);
    jobs.transition(acceptedTransition);
    const result = jobs.transition({ ...acceptedTransition, event: { ...acceptedTransition.event, id: 'event-2' } });
    expect(result).toEqual({ ok: false, current: expect.objectContaining({ revision: 1 }) });
    expect(jobs.listEvents('job-1')).toHaveLength(2);
    expect(operations.list('STATUS_SYNC')).toHaveLength(1);
  } finally { db.close(); }
});

test('rolls back the snapshot when event insertion fails', () => {
  const { db, jobs, operations } = setup();
  jobs.createWithEventAndOperation(job, initialEvent, submitOperation);
  const runSync = db.runSync.bind(db);
  jest.spyOn(db, 'runSync').mockImplementation((sql: string, ...params: unknown[]) => {
    if (sql.includes('workflow_job_events') && params[0] === 'event-1') throw new Error('event insert failed');
    return runSync(sql, ...params);
  });
  try {
    expect(() => jobs.transition(acceptedTransition)).toThrow('event insert failed');
    expect(jobs.get('job-1')).toMatchObject({ revision: 0, status: 'READY_TO_SUBMIT' });
    expect(jobs.listEvents('job-1')).toHaveLength(1);
    expect(operations.get('status-1')).toBeUndefined();
  } finally { db.close(); }
});

test('rolls back snapshot and event when next-operation insertion fails', () => {
  const { db, jobs, operations } = setup();
  jobs.createWithEventAndOperation(job, initialEvent, submitOperation);
  const runSync = db.runSync.bind(db);
  jest.spyOn(db, 'runSync').mockImplementation((sql: string, ...params: unknown[]) => {
    if (sql.includes('workflow_operations') && params[0] === 'status-1') throw new Error('operation insert failed');
    return runSync(sql, ...params);
  });
  try {
    expect(() => jobs.transition(acceptedTransition)).toThrow('operation insert failed');
    expect(jobs.get('job-1')).toMatchObject({ revision: 0, status: 'READY_TO_SUBMIT' });
    expect(jobs.listEvents('job-1')).toHaveLength(1);
    expect(operations.get('status-1')).toBeUndefined();
  } finally { db.close(); }
});
