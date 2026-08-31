import type { ArtifactRecord, JobRecord } from '../jobs/types';
import type { TaskRecord, TaskStatus } from './types';

function status(value: JobRecord['status']): TaskStatus {
  if (value === 'SUCCEEDED') return 'SUCCESS';
  if (value === 'PARTIAL_SUCCEEDED') return 'PARTIAL_SUCCESS';
  if (value === 'FAILED') return 'FAILED';
  if (value === 'CANCELLED') return 'CANCELLED';
  if (value === 'UNKNOWN') return 'UNKNOWN';
  if (value === 'RUNNING') return 'RUNNING';
  return 'QUEUED';
}

export function jobToTaskProjection(job: JobRecord, artifacts: ArtifactRecord[] = [], previous?: TaskRecord): TaskRecord {
  const input = job.inputSnapshot;
  const video = artifacts.find((item) => item.kind === 'video');
  return {
    ...previous,
    id: job.id,
    prompt: String(input.prompt ?? previous?.prompt ?? ''),
    resolution: String(input.resolution ?? previous?.resolution ?? ''),
    duration: Number(input.duration ?? previous?.duration ?? 0),
    seed: typeof input.seed === 'string' ? input.seed : previous?.seed,
    images: (input.images as TaskRecord['images']) ?? previous?.images,
    audios: (input.audios as TaskRecord['audios']) ?? previous?.audios,
    workflowId: job.workflowId,
    workflowVersion: job.workflowVersion,
    workflowContentHash: job.workflowContentHash,
    adapterId: job.adapterId,
    adapterVersion: job.adapterVersion,
    inputSnapshot: input,
    status: status(job.status),
    videoUrl: video?.uri ?? previous?.videoUrl,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt ?? previous?.startedAt,
    executionDuration: job.executionDuration ?? previous?.executionDuration,
    syncError: job.error?.message,
  };
}
