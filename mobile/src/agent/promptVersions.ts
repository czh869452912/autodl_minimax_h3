import { normalizeMessages } from './agentPresentation';
import { parsePromptCandidates } from './promptParser';
import { imageReferenceOrdinal, type PromptBindingImage } from '../handoff/promptBindings';
import type { PromptRun } from './runState';

export type PromptVersion = {
  id: string;
  sourceMessageId: string;
  promptText: string;
  createdAt: number;
  restoredFrom?: string;
  artifactId?: string;
  sourceRevision?: number;
  sourceRange?: { start: number; end: number };
  restoreCommandId?: string;
  images: PromptBindingImage[];
  parameters: { resolution?: string; durationSeconds?: number; seed?: string };
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function copyVersion(version: PromptVersion): PromptVersion {
  return { ...version, ...(version.sourceRange ? { sourceRange: { ...version.sourceRange } } : {}), images: version.images.map((image) => ({ ...image })), parameters: { ...version.parameters } };
}

export function readPromptVersions(state: unknown): PromptVersion[] {
  if (!record(state) || !Array.isArray(state.h3Versions)) return [];
  return state.h3Versions.filter((value): value is PromptVersion => {
    if (!record(value) || typeof value.id !== 'string' || !value.id || typeof value.sourceMessageId !== 'string' || !value.sourceMessageId || typeof value.promptText !== 'string' || !value.promptText.trim() || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return false;
    if (value.restoredFrom !== undefined && typeof value.restoredFrom !== 'string') return false;
    if ([value.artifactId, value.restoreCommandId].some(field => field !== undefined && (typeof field !== 'string' || !field.trim()))) return false;
    if (value.sourceRevision !== undefined && (typeof value.sourceRevision !== 'number' || !Number.isSafeInteger(value.sourceRevision) || value.sourceRevision < 0)) return false;
    if (value.sourceRange !== undefined && (!record(value.sourceRange) || typeof value.sourceRange.start !== 'number' || typeof value.sourceRange.end !== 'number' || !Number.isSafeInteger(value.sourceRange.start) || !Number.isSafeInteger(value.sourceRange.end) || value.sourceRange.start < 0 || value.sourceRange.end <= value.sourceRange.start)) return false;
    if (!Array.isArray(value.images) || !value.images.every((image) => record(image) && typeof image.id === 'string' && Boolean(image.id) && typeof image.displayName === 'string' && Boolean(image.displayName) && typeof image.uri === 'string' && Boolean(image.uri) && (image.filename === undefined || typeof image.filename === 'string') && (image.ordinal === undefined || (typeof image.ordinal === 'number' && Number.isSafeInteger(image.ordinal) && image.ordinal > 0)) && (image.identityKnown === undefined || typeof image.identityKnown === 'boolean'))) return false;
    const parameters = value.parameters;
    return record(parameters) && (parameters.resolution === undefined || typeof parameters.resolution === 'string') && (parameters.seed === undefined || typeof parameters.seed === 'string') && (parameters.durationSeconds === undefined || (typeof parameters.durationSeconds === 'number' && Number.isFinite(parameters.durationSeconds) && parameters.durationSeconds > 0));
  }).map(copyVersion);
}

export function reconcilePromptVersions(messages: readonly unknown[], completedIds: readonly string[], existing: readonly PromptVersion[], now: number, runs: readonly PromptRun[] = []): PromptVersion[] {
  const versions = [...existing];
  const known = new Set(existing.flatMap(version => version.artifactId ? [version.artifactId] : []));
  const legacyMessages = new Set(existing.filter(version => !version.artifactId).map(version => version.sourceMessageId));
  const completed = new Set(completedIds);
  let candidates: PromptVersion['images'] = [];
  const userImages = new Map<string, PromptVersion['images']>();
  const outputRuns = new Map(runs.flatMap(run => run.messageIds.map(id => [id, run] as const)));
  for (const message of messages) {
    if (!record(message)) continue;
    if (message.role === 'user') {
      // Snapshot all images available to this turn. Legacy conversations reused
      // labels, so a later upload replaces that label instead of making it ambiguous.
      const parts = [...(Array.isArray(message.content) ? message.content : []), ...(Array.isArray(message.attachments) ? message.attachments : [])];
      const images = parts.flatMap((part, index): PromptBindingImage[] => {
        if (!record(part) || !['image', 'image_url'].includes(String(part.type))) return [];
        const row = normalizeMessages([{ id: 'image', role: 'user', content: [part] }])[0];
        if (row?.kind !== 'user' || !row.attachments[0]) return [];
        const image = row.attachments[0];
        const metadata = record(part.metadata) ? part.metadata : {};
        const id = typeof metadata.attachmentId === 'string' && metadata.attachmentId ? metadata.attachmentId : typeof part.id === 'string' && part.id ? part.id : undefined;
        return [{ id: id ?? `unresolved-${message.id}-${index}`, displayName: typeof metadata.displayName === 'string' && metadata.displayName ? metadata.displayName : '未绑定图片',
          ...(id ? {} : { identityKnown: false }), ...(typeof metadata.ordinal === 'number' ? { ordinal: metadata.ordinal } : {}),
          ...(image.filename ? { filename: image.filename } : {}), uri: image.uri }];
      });
      if (images.length) {
        const ids = new Set(images.map(image => image.id));
        const ordinals = new Set(images.map(image => image.ordinal ?? imageReferenceOrdinal(image.displayName)).filter(ordinal => ordinal !== undefined));
        candidates = [...candidates.filter(image => !ids.has(image.id) && !ordinals.has(image.ordinal ?? imageReferenceOrdinal(image.displayName) ?? 0)), ...images];
      }
      if (typeof message.id === 'string') userImages.set(message.id, candidates);
      continue;
    }
    if (message.role !== 'assistant' || typeof message.id !== 'string' || !message.id || !completed.has(message.id) || legacyMessages.has(message.id)) continue;
    const content = typeof message.content === 'string' ? message.content : Array.isArray(message.content) ? message.content.map((part) => typeof part === 'string' ? part : record(part) && typeof part.text === 'string' ? part.text : '').join('\n') : '';
    const revision = typeof message.revision === 'number' && Number.isSafeInteger(message.revision) ? message.revision : 0;
    const results = parsePromptCandidates(content, message.id, revision);
    const run = outputRuns.get(message.id);
    const images = run ? userImages.get(run.userMessageId) ?? [] : candidates;
    for (const result of results) {
      if (known.has(result.id)) continue;
      versions.push({ id: `version-${result.id}`, artifactId: result.id, sourceMessageId: message.id, sourceRevision: result.sourceRevision, sourceRange: { ...result.range }, promptText: result.promptText, createdAt: run?.endedAt ?? now, images: images.map((image) => ({ ...image })), parameters: {} });
      known.add(result.id);
    }
  }
  return versions;
}

export function restorePromptVersion(versions: readonly PromptVersion[], id: string, now: number, commandId?: string): PromptVersion[] {
  if (commandId && versions.some(version => version.restoreCommandId === commandId)) return [...versions];
  const version = versions.find((item) => item.id === id);
  if (!version) return [...versions];
  const base = commandId ? `restored-${encodeURIComponent(commandId)}` : `${id}-restored-${now}`;
  let restoredId = base;
  let suffix = 1;
  const ids = new Set(versions.map((item) => item.id));
  while (ids.has(restoredId)) restoredId = `${base}-${suffix++}`;
  return [...versions, { ...copyVersion(version), id: restoredId, createdAt: now, restoredFrom: id, ...(commandId ? { restoreCommandId: commandId } : {}) }];
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
