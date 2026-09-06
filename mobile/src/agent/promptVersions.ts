import { normalizeMessages } from './agentPresentation';
import { parsePromptResult } from './promptParser';
import type { PromptRun } from './runState';

export type PromptVersion = {
  id: string;
  sourceMessageId: string;
  promptText: string;
  createdAt: number;
  restoredFrom?: string;
  images: Array<{ id: string; displayName: string; filename?: string; uri: string }>;
  parameters: { resolution?: string; durationSeconds?: number; seed?: string };
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function copyVersion(version: PromptVersion): PromptVersion {
  return { ...version, images: version.images.map((image) => ({ ...image })), parameters: { ...version.parameters } };
}

export function readPromptVersions(state: unknown): PromptVersion[] {
  if (!record(state) || !Array.isArray(state.h3Versions)) return [];
  return state.h3Versions.filter((value): value is PromptVersion => {
    if (!record(value) || typeof value.id !== 'string' || !value.id || typeof value.sourceMessageId !== 'string' || !value.sourceMessageId || typeof value.promptText !== 'string' || !value.promptText.trim() || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return false;
    if (value.restoredFrom !== undefined && typeof value.restoredFrom !== 'string') return false;
    if (!Array.isArray(value.images) || !value.images.every((image) => record(image) && typeof image.id === 'string' && Boolean(image.id) && typeof image.displayName === 'string' && Boolean(image.displayName) && typeof image.uri === 'string' && Boolean(image.uri) && (image.filename === undefined || typeof image.filename === 'string'))) return false;
    const parameters = value.parameters;
    return record(parameters) && (parameters.resolution === undefined || typeof parameters.resolution === 'string') && (parameters.seed === undefined || typeof parameters.seed === 'string') && (parameters.durationSeconds === undefined || (typeof parameters.durationSeconds === 'number' && Number.isFinite(parameters.durationSeconds) && parameters.durationSeconds > 0));
  }).map(copyVersion);
}

export function reconcilePromptVersions(messages: readonly unknown[], completedIds: readonly string[], existing: readonly PromptVersion[], now: number, runs: readonly PromptRun[] = []): PromptVersion[] {
  const versions = [...existing];
  const known = new Set(existing.map((version) => version.sourceMessageId));
  const completed = new Set(completedIds);
  let candidates: PromptVersion['images'] = [];
  const userImages = new Map<string, PromptVersion['images']>();
  const outputRuns = new Map(runs.flatMap(run => run.messageIds.map(id => [id, run] as const)));
  for (const message of messages) {
    if (!record(message)) continue;
    if (message.role === 'user') {
      // Default preview candidates come only from the most recent image-bearing
      // user turn. Text-only refinements retain them; never merge same labels
      // across turns. The export preview makes this scope explicit and editable.
      const row = normalizeMessages([{ ...message, id: typeof message.id === 'string' ? message.id : 'legacy-user' }])[0];
      if (row?.kind === 'user' && row.attachments.length) candidates = row.attachments.map((image, index) => ({ id: image.attachmentId ?? `${row.id}-image-${index + 1}`, displayName: image.displayName ?? `图片${index + 1}`, ...(image.filename ? { filename: image.filename } : {}), uri: image.uri }));
      if (typeof message.id === 'string') userImages.set(message.id, candidates);
      continue;
    }
    if (message.role !== 'assistant' || typeof message.id !== 'string' || !message.id || !completed.has(message.id) || known.has(message.id)) continue;
    const content = typeof message.content === 'string' ? message.content : Array.isArray(message.content) ? message.content.map((part) => typeof part === 'string' ? part : record(part) && typeof part.text === 'string' ? part.text : '').join('\n') : '';
    const result = parsePromptResult(content, message.id);
    if (!result) continue;
    const run = outputRuns.get(message.id);
    const images = run ? userImages.get(run.userMessageId) ?? [] : candidates;
    versions.push({ id: `version-${message.id}`, sourceMessageId: message.id, promptText: result.promptText, createdAt: run?.endedAt ?? now, images: images.map((image) => ({ ...image })), parameters: {} });
    known.add(message.id);
  }
  return versions;
}

export function restorePromptVersion(versions: readonly PromptVersion[], id: string, now: number): PromptVersion[] {
  const version = versions.find((item) => item.id === id);
  if (!version) return [...versions];
  const base = `${id}-restored-${now}`;
  let restoredId = base;
  let suffix = 1;
  const ids = new Set(versions.map((item) => item.id));
  while (ids.has(restoredId)) restoredId = `${base}-${suffix++}`;
  return [...versions, { ...copyVersion(version), id: restoredId, createdAt: now, restoredFrom: id }];
}

export type PromptDiffLine = { kind: 'same' | 'removed' | 'added'; text: string };

export function diffPromptVersions(before: string, after: string): PromptDiffLine[] {
  const left = before === '' ? [] : before.split('\n');
  const right = after === '' ? [] : after.split('\n');
  const result: PromptDiffLine[] = [];
  // Keep memory/time bounded. For very large documents preserve the common
  // prefix/suffix and show the changed middle honestly as removed/added lines.
  if (left.length * right.length > 250_000) {
    let start = 0;
    while (start < left.length && start < right.length && left[start] === right[start]) {
      result.push({ kind: 'same', text: left[start++] });
    }
    let end = 0;
    while (end < left.length - start && end < right.length - start && left[left.length - 1 - end] === right[right.length - 1 - end]) end++;
    result.push(...left.slice(start, left.length - end).map((text): PromptDiffLine => ({ kind: 'removed', text })), ...right.slice(start, right.length - end).map((text): PromptDiffLine => ({ kind: 'added', text })), ...left.slice(left.length - end).map((text): PromptDiffLine => ({ kind: 'same', text })));
    return result;
  }
  const table = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { result.push({ kind: 'same', text: left[i++] }); j++; }
    else if (i < left.length && (j === right.length || table[i + 1][j] >= table[i][j + 1])) result.push({ kind: 'removed', text: left[i++] });
    else result.push({ kind: 'added', text: right[j++] });
  }
  return result;
}
