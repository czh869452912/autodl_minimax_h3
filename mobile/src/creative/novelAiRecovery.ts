import type { AppDatabase } from '../storage/appDatabase';
import type { JobStateRepository } from '../tasks/jobStateStore';
import { novelAiKey, novelAiBodyHash, type NovelAiResponseStore } from './novelAiAdapter';
import { creativeRequestHash } from './videoSubmission';
import {isNovelAiUpscaleRequest,upscaleExpectedSize} from './novelAiUpscale';

/** Read-only external reconciliation: only a verified local response can resume import. */
export async function recoverNovelAiResponses(db: AppDatabase, jobs: JobStateRepository, store: NovelAiResponseStore, now = Date.now()) {
  const rows = await db.getAllAsync<{ id: string; payload_json: string; request_hash: string }>(`SELECT j.id,o.payload_json,c.request_hash FROM workflow_jobs j
    JOIN creative_job_contexts c ON c.job_id=j.id JOIN creative_execution_state e ON e.id=1 AND e.epoch=c.execution_epoch
    JOIN workflow_operations o ON o.job_id=j.id AND o.kind='SUBMIT' AND o.state='BLOCKED'
    WHERE j.adapter_id='novelai-image' AND j.status='UNKNOWN'
    AND NOT EXISTS(SELECT 1 FROM creative_restore_quarantine q WHERE q.entity_kind='job' AND q.entity_id=j.id) LIMIT 32`);
  let recovered = 0;
  for (const row of rows) {
    const prepared = JSON.parse(row.payload_json).prepared;
    if (!prepared || creativeRequestHash(prepared) !== row.request_hash) continue;
    let upscaleSize;
    try{if(isNovelAiUpscaleRequest(prepared.requestInput))upscaleSize=upscaleExpectedSize(prepared.requestInput);}catch{continue;}
    const key = novelAiKey(row.id), requestHash = novelAiBodyHash(prepared.requestInput);
    let uri: string | null = null;
    try { uri = await store.lookup(key, requestHash); } catch { continue; }
    if (!uri) continue;
    const job = await jobs.get(row.id);
    if (!job || job.status !== 'UNKNOWN') continue;
    const result = await jobs.transition({ jobId: row.id, expectedRevision: job.revision,
      patch: { status: 'QUEUED', providerHandle: { kind: 'novelai-local-response', key, requestHash, expectedImages: prepared.requestInput.parameters?.n_samples ?? 1, ...(upscaleSize?{operation:'upscale',outputSize:upscaleSize}:{}) }, lastError: undefined, updatedAt: now },
      event: { id: `${row.id}:response:${job.revision}`, type: 'LOCAL_RESPONSE_RECOVERED', payload: {}, createdAt: now },
      nextOperations: [{ id: `${row.id}:response-import:${job.revision}`, kind: 'STATUS_SYNC', jobId: row.id, idempotencyKey: `${row.id}:response-import:${job.revision}`, payload: {}, now }] });
    if (result.ok) recovered++;
  }
  return recovered;
}
