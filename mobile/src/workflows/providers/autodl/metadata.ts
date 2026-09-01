import type { HttpTransport } from '../../../providers/httpTransport';

export const H3_WORKFLOW_ID = 'minimax_h3_image_audio_to_video_v2_15s';
export const H3_METADATA_URL = `https://www.autodl.art/api/v1/comfyui/workflows/${H3_WORKFLOW_ID}`;

export type AutodlInputRule = {
  type?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  acceptTypes: string[];
};

export type AutodlWorkflowMetadata = {
  workflowId: string;
  inputRules: Record<string, AutodlInputRule>;
};

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function parseRule(value: unknown, key: string): AutodlInputRule {
  const rule = asObject(value, `${key} rule is required`);
  const acceptTypes = rule.accept_types;
  if (acceptTypes !== undefined && (!Array.isArray(acceptTypes) || acceptTypes.some((item) => typeof item !== 'string' || !item.includes('/')))) throw new Error(`${key}.accept_types is invalid`);
  const numeric = (name: 'min' | 'max' | 'min_length' | 'max_length'): number | undefined => {
    const item = rule[name];
    if (item === undefined) return undefined;
    if (typeof item !== 'number' || !Number.isFinite(item)) throw new Error(`${key}.${name} is invalid`);
    return item;
  };
  return {
    type: typeof rule.type === 'string' ? rule.type : undefined,
    minimum: numeric('min'),
    maximum: numeric('max'),
    minLength: numeric('min_length'),
    maxLength: numeric('max_length'),
    acceptTypes: Array.isArray(acceptTypes) ? acceptTypes.map((item) => String(item)) : [],
  };
}

export function parseAutodlWorkflowMetadata(value: unknown): AutodlWorkflowMetadata {
  const envelope = asObject(value, 'metadata must be an object');
  if (envelope.code !== undefined && String(envelope.code).toLowerCase() !== 'success') throw new Error('AutoDL metadata response is not successful');
  const data = asObject(envelope.data ?? envelope, 'metadata data is required');
  const workflowId = data.uuid ?? data.workflow_id;
  if (workflowId !== H3_WORKFLOW_ID) throw new Error(`workflow_id must be ${H3_WORKFLOW_ID}`);
  const inputRulesObject = asObject(data.input_rules, 'input_rules is required');
  const inputRules = Object.fromEntries(Object.entries(inputRulesObject).map(([key, rule]) => [key, parseRule(rule, key)]));
  for (const key of ['ref_image_0', 'ref_image_8', 'ref_audio_0', 'ref_audio_2']) {
    if (!inputRules[key]) throw new Error(`${key} rule is required`);
  }
  const duration = inputRules.duration;
  if (!duration || duration.type !== 'integer' || duration.minimum !== 1 || duration.maximum !== 15) throw new Error('duration contract is invalid');
  const prompt = inputRules.prompt;
  if (!prompt || (prompt.type !== 'prompt' && prompt.type !== 'string') || prompt.minLength !== 1 || prompt.maxLength !== 10000) throw new Error('prompt contract is invalid');
  const seed = inputRules.seed;
  if (!seed || seed.type !== 'integer' || seed.minimum !== 1 || seed.maximum !== 999999999999999) throw new Error('seed contract is invalid');
  return { workflowId: H3_WORKFLOW_ID, inputRules };
}

export async function fetchAutodlWorkflowMetadata({
  transport,
  url = H3_METADATA_URL,
  timeoutMs = 15_000,
}: {
  transport: HttpTransport;
  url?: string;
  timeoutMs?: number;
}): Promise<AutodlWorkflowMetadata> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await transport(url, { method: 'GET', signal: controller.signal });
  } catch (error) {
    throw new Error(controller.signal.aborted ? 'AutoDL metadata request timed out' : `AutoDL metadata request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`AutoDL metadata request failed (HTTP ${response.status})`);
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error('AutoDL metadata response is not valid JSON'); }
  return parseAutodlWorkflowMetadata(body);
}
