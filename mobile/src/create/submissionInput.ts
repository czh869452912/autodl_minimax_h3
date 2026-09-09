import type { TaskMediaInput } from '../media/types';
import type { WorkflowDefinition } from '../workflows/schema/types';
import { inputField, inputProperties, normalizeWorkflowInputs } from '../workflows/inputModel';

const MIN_SEED = 1;
const MAX_SEED = 999999999999999;

type SubmissionInput = {
  definition?: WorkflowDefinition;
  workflowValues: Record<string, unknown>;
  fallback: { prompt: string; resolution: string; duration: string; seed: string };
  images: TaskMediaInput[];
  audios: TaskMediaInput[];
  random?: () => number;
};

function randomSeed(random: () => number): number {
  return Math.floor(random() * (MAX_SEED - MIN_SEED + 1)) + MIN_SEED;
}

export function buildSubmissionInputSnapshot({
  definition,
  workflowValues,
  fallback,
  images,
  audios,
  random = Math.random,
}: SubmissionInput): Record<string, unknown> {
  if (definition) {
    const values = { ...workflowValues };
    const properties = inputProperties(definition);
    for (const [target, media] of [['images', images], ['audios', audios]] as const) {
      const field = inputField(definition, target);
      if (properties[field]) values[field] = media;
    }
    const seedField = inputField(definition, 'seed');
    const schema = properties[seedField];
    if (schema && String(values[seedField] ?? '').trim() === '') {
      const minimum = Number(schema.minimum ?? MIN_SEED);
      const maximum = Number(schema.maximum ?? MAX_SEED);
      values[seedField] = Math.floor(random() * (maximum - minimum + 1)) + minimum;
    }
    return normalizeWorkflowInputs(definition, values);
  }
  const snapshot: Record<string, unknown> = { ...workflowValues, images, audios };
  if ('prompt' in workflowValues) snapshot.prompt = String(workflowValues.prompt ?? fallback.prompt).trim();
  if ('resolution' in workflowValues) snapshot.resolution = String(workflowValues.resolution ?? fallback.resolution);
  if ('duration' in workflowValues) snapshot.duration = Number(workflowValues.duration ?? fallback.duration) || 0;
  if ('seed' in workflowValues) {
    const seed = String(workflowValues.seed ?? fallback.seed).trim();
    snapshot.seed = seed === '' ? randomSeed(random) : /^\d+$/.test(seed) ? Number(seed) : seed;
  }
  return snapshot;
}
