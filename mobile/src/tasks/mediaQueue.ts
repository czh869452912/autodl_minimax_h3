import type { JobRepository } from '../jobs/types';
import type { MediaAsset, MediaStore } from '../media/types';
import { materializeJobArtifacts } from '../media/materializer';
import type { TaskMediaPatch, TaskRecord } from './types';
import type { ArtifactDownloadPolicy } from '../workflows/schema/types';

type Settings = { token: string; autoExportToGallery: boolean; keepPrivateCopy: boolean };
type QueueDeps = {
  ensureMedia(task: TaskRecord, settings: Settings, onUpdate: (patch: Partial<TaskRecord>) => Promise<void>, artifactPolicy?: ArtifactDownloadPolicy, asset?: MediaAsset | null): Promise<unknown>;
  getArtifactPolicy?(adapterId?: string): ArtifactDownloadPolicy | undefined;
  taskStore: { upsert(task: TaskRecord): Promise<void>; upsertMediaProjection?(task: TaskRecord): Promise<void>; updateMediaProjection?(id: string, patch: TaskMediaPatch): Promise<boolean> };
  jobStore: Pick<JobRepository, 'get' | 'listArtifacts'>;
  mediaStore?: Pick<MediaStore, 'upsert'> & Partial<Pick<MediaStore, 'upsertArtifactProjection' | 'upsertDelivery' | 'getPrimaryVideoByTaskId'>>;
  now?: () => number;
  concurrency?: number;
  batchSize?: number;
};

export function createMediaDeliveryQueue(deps: QueueDeps) {
  const pending = new Map<string, { task: TaskRecord; settings: Settings }>();
  const running = new Set<string>();
  const concurrency = Math.max(1, deps.concurrency ?? 1);
  const batchSize = Math.max(1, deps.batchSize ?? 4);
  const now = deps.now ?? Date.now;

  const processTask = async (entry: { task: TaskRecord; settings: Settings }) => {
    let current = entry.task;
    const onUpdate = async (patch: Partial<TaskRecord>) => {
      current = { ...current, ...patch };
      if (deps.taskStore.updateMediaProjection) {
        if (!(await deps.taskStore.updateMediaProjection(current.id, patch))) throw new Error('任务已删除');
      } else {
        await (deps.taskStore.upsertMediaProjection?.(current) ?? deps.taskStore.upsert(current));
      }
    };
    const artifactPolicy = deps.getArtifactPolicy?.(current.adapterId);
    const asset = await deps.mediaStore?.getPrimaryVideoByTaskId?.(current.id);
    await deps.ensureMedia(current, entry.settings, onUpdate, artifactPolicy, asset);
    if (!deps.mediaStore) return;
    const job = await deps.jobStore.get(current.id);
    const artifacts = job ? await deps.jobStore.listArtifacts(job.id) : [];
    if (job && artifacts.length) await materializeJobArtifacts(job, artifacts, deps.mediaStore, current);
    const primary = artifacts.find((artifact) => artifact.kind === 'video') ?? artifacts[0];
    const assetId = job && primary ? `${job.id}:${primary.id}` : current.id;
    if (current.exportState === 'EXPORTED' && current.galleryUri) {
      await deps.mediaStore.upsertDelivery?.({ id: `${assetId}:system-gallery`, assetId, target: 'system-gallery', uri: current.galleryUri, status: 'EXPORTED', createdAt: current.exportedAt ?? now(), updatedAt: now() });
    }
  };

  const pump = () => {
    let started = 0;
    while (pending.size && running.size < concurrency && started < batchSize) {
      const next = pending.entries().next().value as [string, { task: TaskRecord; settings: Settings }] | undefined;
      if (!next) break;
      const [id, entry] = next;
      pending.delete(id);
      running.add(id);
      started += 1;
      void processTask(entry).catch(() => undefined).finally(() => {
        running.delete(id);
        pump();
      });
    }
  };

  return {
    enqueue(task: TaskRecord, settings: Settings) {
      if (running.has(task.id)) return;
      pending.set(task.id, { task, settings });
      pump();
    },
    size() { return pending.size + running.size; },
  };
}
