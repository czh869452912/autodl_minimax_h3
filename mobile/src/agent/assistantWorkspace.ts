import type { AssistantImageAttachment } from './assistantImagePicker';
import type { PresentationMessage } from './agentPresentation';
import { readPromptRuns, type PromptRun } from './runState';

export function readComposerDraft(state: unknown): { text: string; attachments: Array<AssistantImageAttachment & { displayName?: string }> } {
  const draft = (state as { h3Composer?: { text?: unknown; attachments?: unknown } } | null)?.h3Composer;
  const attachments = Array.isArray(draft?.attachments) ? draft.attachments.filter((item): item is AssistantImageAttachment & { displayName?: string } =>
    item && typeof item.id === 'string' && item.status === 'ready' && item.type === 'image'
    && ['data', 'url'].includes(item.source?.type) && typeof item.source.value === 'string' && item.source.value.length > 0) : [];
  return { text: typeof draft?.text === 'string' ? draft.text : '', attachments };
}
export type RunRow = { id: string; kind: 'run'; run: PromptRun };
export function insertRunRows(rows: PresentationMessage[], runs: PromptRun[]): Array<PresentationMessage | RunRow> {
  const ids = new Set(rows.map(row => row.id));
  const anchors = new Map<string, RunRow[]>();
  const unanchored: RunRow[] = [];
  for (const run of runs) {
    const anchor = [...run.messageIds].reverse().find(id => ids.has(id)) ?? run.userMessageId;
    const row: RunRow = { id: `run-${run.id}`, kind: 'run', run };
    if (!ids.has(anchor)) unanchored.push(row);
    else anchors.set(anchor, [...(anchors.get(anchor) ?? []), row]);
  }
  return rows.flatMap(row => [row, ...(anchors.get(row.id) ?? [])] as Array<PresentationMessage | RunRow>).concat(unanchored);
}
export const RUN_LABELS: Record<PromptRun['status'], string> = {
  queued: '等待运行', running: '生成中', completed: '已完成', failed: '失败', cancelled: '已停止', interrupted: '已中断',
};
export function sessionRunLabel(state: unknown): string {
  const runs = readPromptRuns(state);
  const current = runs.find(run => run.status === 'running') ?? runs[runs.length - 1];
  if (!current) return '';
  const readAt = (state as { h3ReadAt?: number })?.h3ReadAt ?? 0;
  return RUN_LABELS[current.status] + (current.endedAt && current.endedAt > readAt ? ' · 未读' : '');
}
export function toolActivity(name: string): string {
  const labels: Record<string, string> = { read_file: '读取写作规范', write_file: '整理创作方案', edit_file: '修订创作方案', write_todos: '规划创作步骤', task: '执行创作子任务', ls: '查找参考资料', glob: '查找参考资料', grep: '检索参考资料' };
  return labels[name] ?? `执行 ${name}`;
}
