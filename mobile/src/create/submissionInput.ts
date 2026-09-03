import type { TaskMediaInput } from '../tasks/types';

const MIN_SEED = 1;
const MAX_SEED = 999999999999999;

type SubmissionInput = {
  workflowValues: Record<string, unknown>;
  fallback: { prompt: string; resolution: string; duration: string; seed: string };
  images: TaskMediaInput[];
  audios: TaskMediaInput[];
  random?: () => number;
};

function randomSeed(random: () => number): string {
  return String(Math.floor(random() * (MAX_SEED - MIN_SEED + 1)) + MIN_SEED);
}

export function buildSubmissionInputSnapshot({
  workflowValues,
  fallback,
  images,
  audios,
  random = Math.random,
}: SubmissionInput): Record<string, unknown> {
  const snapshot: Record<string, unknown> = { ...workflowValues, images, audios };
  if ('prompt' in workflowValues) snapshot.prompt = String(workflowValues.prompt ?? fallback.prompt).trim();
  if ('resolution' in workflowValues) snapshot.resolution = String(workflowValues.resolution ?? fallback.resolution);
  if ('duration' in workflowValues) snapshot.duration = Number(workflowValues.duration ?? fallback.duration) || 0;
  if ('seed' in workflowValues) {
    const seed = String(workflowValues.seed ?? fallback.seed).trim();
    snapshot.seed = seed || randomSeed(random);
  }
  return snapshot;
}
