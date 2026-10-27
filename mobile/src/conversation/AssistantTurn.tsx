import type { ReactNode } from 'react';
import { View } from 'react-native';
import { RunProgress } from './RunProgress';
import { ActivityGroup } from './ActivityGroup';
import { ConversationMessage } from './ConversationMessage';
import { projectRunTimeline } from './projectTimeline';
import type { PromptRun } from './types';

/** Both assistant surfaces use the same ordered projection and process disclosures. */
export function AssistantTurn({ run, text, children, onInspect }: { run: PromptRun; text: string; children?: ReactNode; onInspect?: () => void }) {
  const activities = run.activities ?? [];
  const rows: Array<{ id: string; kind: 'assistant'; text: string; tools: [] }> = [];
  for (const activity of activities) {
    let row = rows.find(item => item.id === activity.messageId);
    if (!row) { row = { id: activity.messageId, kind: 'assistant', text: '', tools: [] }; rows.push(row); }
    if (activity.kind === 'text') row.text = activity.text ?? '';
  }
  // Old records have only a combined reply. A new tool-only proposal produces its
  // summary after the tool; never move that synthesized answer ahead of execution.
  if (!rows.length || (!rows.some(row => row.text) && text.trim())) {
    rows.push({ id: activities.length ? `${run.id}:answer` : run.messageIds[0] ?? run.id, kind: 'assistant', text, tools: [] });
  }
  const projected = projectRunTimeline(rows, [{ ...run, messageIds: rows.map(r => r.id) }]);
  return <View style={{ gap: 4 }}>{projected.map(row => row.kind === 'run'
    ? <ActivityGroup activeTurn={row.live} key={row.id} disclosureId={row.id} run={row.run} entries={row.entries} onInspect={onInspect}/>
    : row.text ? <ConversationMessage key={row.id} role="assistant" text={row.text} streaming={run.status === 'running' && row.id === rows.at(-1)?.id}/> : null)}{children}{run.status === 'running' ? <RunProgress startedAt={run.startedAt}/> : null}</View>;
}
