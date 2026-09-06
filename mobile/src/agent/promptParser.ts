export type PromptParseResult = {
  promptText: string;
  sourceMessageId: string;
  confidence: 'high' | 'medium';
};

const TITLE = /(?:^|\n)[ \t]{0,3}(?:#{1,6}[ \t]*)?(?:(?:最终[ \t]*)?H3[ \t]+Prompt|最终[ \t]*Prompt)[ \t]*[:：]?[ \t]*\r?\n([\s\S]*?)(?=\n[ \t]*#{1,6}[ \t]|$)/gi;

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

export function parsePromptResult(content: string, messageId: string): PromptParseResult | null {
  const fences = fencedBlocks(content);
  const dedicated = fences.filter((block) => block.closed && block.info.toLowerCase() === 'h3-prompt');
  let candidate: string | undefined;
  // Multiple artifacts require explicit selection; do not guess which one to export.
  if (dedicated.length === 1) candidate = dedicated[0].body;
  else if (dedicated.length > 1) return null;
  else {
    const titled = [...content.matchAll(TITLE)].find((match) => {
      // Titles within generic examples are never artifact declarations.
      return !fences.some((block) => match.index >= block.start && match.index < block.end);
    })?.[1]?.trim();
    if (!titled) return null;
    if (/^(?:`{3,}|~{3,})/.test(titled)) {
      const blocks = fencedBlocks(titled);
      if (blocks.length !== 1 || !blocks[0].closed || blocks[0].start !== 0 || blocks[0].end !== titled.length) return null;
      candidate = blocks[0].body;
    } else candidate = titled;
  }
  return candidate && hasH3Fields(candidate)
    ? { promptText: candidate, sourceMessageId: messageId, confidence: 'high' }
    : null;
}
