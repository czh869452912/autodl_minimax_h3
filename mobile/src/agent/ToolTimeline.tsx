import { ActivityGroup } from '../conversation/ActivityGroup';
import type { ToolTimelineStep } from './agentPresentation';

/** Legacy transcripts have no timestamps; do not manufacture execution timings. */
export function ToolTimeline({ steps }: { steps: ToolTimelineStep[] }) {
  const tools = steps.map(step => ({...step, startedAt: 0}));
  const status = tools.some(t => t.status === 'running') ? 'running' : tools.some(t => t.status === 'failed') ? 'failed' : tools.some(t => t.status === 'cancelled') ? 'cancelled' : 'completed';
  return <ActivityGroup run={{id: steps[0]?.id ?? 'legacy', userMessageId:'', messageIds:[], tools, startedAt:0, status}} entries={tools.map(tool => ({id:tool.id,kind:'tool',tool}))}/>;
}
