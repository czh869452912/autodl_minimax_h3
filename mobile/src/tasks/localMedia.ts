import * as FileSystem from 'expo-file-system/legacy';
import type { MediaAsset } from '../media/types';
import type { TaskRecord } from './types';

type LocalMediaDeps = {
  documentDirectory?: string | null;
  getInfo(uri: string): Promise<{ exists: boolean; isDirectory?: boolean; size?: number }>;
};

const defaultDeps: LocalMediaDeps = {
  documentDirectory: FileSystem.documentDirectory,
  getInfo: (uri) => FileSystem.getInfoAsync(uri),
};

export function privateVideoPath(taskId: string, documentDirectory = FileSystem.documentDirectory): string | undefined {
  return documentDirectory ? `${documentDirectory.replace(/\/+$/, '')}/media/${taskId}.mp4` : undefined;
}

export async function resolveLocalVideoSource(
  { task, asset }: { task: Pick<TaskRecord, 'id' | 'localUri'>; asset?: Pick<MediaAsset, 'localPath'> | null },
  deps: LocalMediaDeps = defaultDeps,
): Promise<string | undefined> {
  const deterministic = privateVideoPath(task.id, deps.documentDirectory);
  const candidates = [asset?.localPath, task.localUri, deterministic]
    .filter((value): value is string => Boolean(value?.startsWith('file://')));
  for (const candidate of [...new Set(candidates)]) {
    try {
      const info = await deps.getInfo(candidate);
      if (info.exists && info.isDirectory !== true && (info.size == null || info.size > 0)) return candidate;
    } catch {
      // A single stale or inaccessible projection must not hide later valid copies.
    }
  }
  return undefined;
}
