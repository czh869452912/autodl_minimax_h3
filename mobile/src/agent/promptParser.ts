export type PromptParseResult = {
  promptText: string;
  sourceMessageId: string;
  confidence: 'high' | 'medium';
};

export type PromptArtifactCandidate = PromptParseResult & {
  id: string;
  sourceRevision: number;
  range: { start: number; end: number };
};
const TITLE = /^[ \t]{0,3}(?:#{1,6}[ \t]*)?(?:(?:最终[ \t]*)?H3[ \t]+Prompt|最终[ \t]*Prompt)[ \t]*[:：]?[ \t]*\r?$/gim;

type FenceBlock = { start: number; end: number; info: string; body: string; closed: boolean };
function fencedBlocks(content: string): FenceBlock[] {
  const blocks: FenceBlock[] = [];
  let open: { marker: string; length: number; start: number; bodyStart: number; info: string } | undefined;
  let offset = 0;
  for (const line of content.split('\n')) {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?$/);
    if (fence) {
      if (!open) open = { marker: fence[1][0], length: fence[1].length, start: offset, bodyStart: offset + line.length + 1, info: fence[2].trim() };
      else if (fence[1][0] === open.marker && fence[1].length >= open.length && !fence[2].trim()) {
        blocks.push({ start: open.start, end: offset + line.length, info: open.info, body: content.slice(open.bodyStart, offset).trim(), closed: true });
        open = undefined;
      }
    }
    offset += line.length + 1;
  }
  if (open) blocks.push({ start: open.start, end: content.length, info: open.info, body: content.slice(open.bodyStart).trim(), closed: false });
  return blocks;
}

function hasH3Fields(text: string): boolean {
  const fields = new Map<string, string>();
  const pattern = /^([a-z_]+):[ \t]*([\s\S]*?)(?=^[a-z_]+:|$(?![\s\S]))/gm;
  for (const match of text.matchAll(pattern)) fields.set(match[1], match[2].trim());
  if (['integrated_multimodal_description', 'overall_soundscape', 'non_diegetic_music'].every((field) => Boolean(fields.get(field)))) return true;
  return ['subject_definitions', 'summary', 'retention_analysis', 'detailed_description', 'overall_soundscape', 'non_diegetic_music']
    .every((field) => Boolean(fields.get(field)));
}

export function parsePromptCandidates(content: string, messageId: string, revision = 0): PromptArtifactCandidate[] {
  const fences = fencedBlocks(content);
  const ranges = fences.filter(block => block.closed && block.info.toLowerCase() === 'h3-prompt')
    .map(block => ({ start: block.start, end: block.end, body: block.body }));
  for (const title of content.matchAll(TITLE)) {
    const start = title.index!;
    if (fences.some(block => start >= block.start && start < block.end)) continue;
    const afterTitle = start + title[0].length;
    const bodyStart = afterTitle + (content.slice(afterTitle).match(/^\s*/)?.[0].length ?? 0);
    const fence = fences.find(block => block.start === bodyStart);
    if (fence) {
      if (fence.closed) {
        const existing = ranges.find(range => range.start === fence.start);
        if (existing) existing.start = start;
        else ranges.push({ start, end: fence.end, body: fence.body });
      }
      continue;
    }
    const nextHeading = [...content.slice(bodyStart).matchAll(/^[ \t]{0,3}#{1,6}[ \t]+/gm)]
      .map(match => bodyStart + match.index!)
      .find(offset => !fences.some(block => offset >= block.start && offset < block.end));
    const end = nextHeading ?? content.length;
    ranges.push({ start, end, body: content.slice(bodyStart, end).trim() });
  }
  return ranges.sort((left, right) => left.start - right.start).filter(range => hasH3Fields(range.body)).map((range, index) => ({
    id: `artifact-${encodeURIComponent(messageId)}-${revision}-${index + 1}`,
    sourceMessageId: messageId, sourceRevision: revision, promptText: range.body, confidence: 'high',
    range: { start: range.start, end: range.end },
  }));
}

export function removePromptCandidateRanges(content: string, candidates: readonly PromptArtifactCandidate[], selectedIds: readonly string[]): string {
  const selected = new Set(selectedIds);
  let cursor = 0;
  let result = '';
  for (const candidate of [...candidates].filter(candidate => selected.has(candidate.id)).sort((left, right) => left.range.start - right.range.start)) {
    if (candidate.range.start < cursor || candidate.range.end > content.length) continue;
    result += content.slice(cursor, candidate.range.start);
    cursor = candidate.range.end;
  }
  return result + content.slice(cursor);
}

export function parsePromptResult(content: string, messageId: string): PromptParseResult | null {
  const candidates = parsePromptCandidates(content, messageId);
  if (candidates.length !== 1) return null;
  const { promptText, sourceMessageId, confidence } = candidates[0];
  return { promptText, sourceMessageId, confidence };
}
