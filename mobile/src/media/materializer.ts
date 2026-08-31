import type { ArtifactRecord, JobRecord } from '../jobs/types';
import type { TaskRecord } from '../tasks/types';
import type { MediaAsset, MediaStore } from './types';

type AssetStore = Pick<MediaStore, 'upsert'>;

export async function materializeJobArtifacts(job: JobRecord, artifacts: ArtifactRecord[], store: AssetStore, task?: Pick<TaskRecord, 'prompt' | 'thumbnailUrl' | 'createdAt' | 'localUri'>): Promise<MediaAsset[]> {
  const assets: MediaAsset[] = [];
  for (const artifact of artifacts) {
    const sourceUrl = artifact.uri?.trim();
    if (!sourceUrl) continue;
    const asset: MediaAsset = {
      id: `${job.id}:${artifact.id}`,
      taskId: job.id,
      artifactId: artifact.id,
      jobId: job.id,
      workflowId: job.workflowId,
      title: task?.prompt?.slice(0, 48) || job.workflowId,
      prompt: task?.prompt || String(job.inputSnapshot.prompt ?? ''),
      sourceUrl,
      posterPath: task?.thumbnailUrl,
      mimeType: artifact.mime || (artifact.kind === 'video' ? 'video/mp4' : `${artifact.kind}/*`),
      kind: artifact.kind,
      status: 'downloading',
      durationMs: typeof artifact.metadata?.durationMs === 'number' ? artifact.metadata.durationMs : undefined,
      createdAt: task?.createdAt ?? job.createdAt,
      updatedAt: job.updatedAt,
    };
    if (task?.localUri && artifact.kind === 'video') { asset.localPath = task.localUri; asset.status = 'downloaded'; }
    await store.upsert(asset);
    assets.push(asset);
  }
  return assets;
}
