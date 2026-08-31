import type { LocalThreadSnapshot } from './threadStore';
import { groupSessions, matchesSessionQuery, normalizeMessages, toolTimelineSummary } from './agentPresentation';

const snapshot = (updatedAt: number, customTitle?: string): LocalThreadSnapshot => ({
  threadId: `t-${updatedAt}`, messages: [{ id: 'u', role: 'user', content: '屋顶上的猫' }] as never, state: {}, createdAt: updatedAt, updatedAt, customTitle,
});

describe('agent presentation helpers', () => {
  it('normalizes user, assistant and tool messages with stable tool steps', () => {
    const rows = normalizeMessages([
      { id: 'u1', role: 'user', content: '拍一只猫' },
      { id: 'a1', role: 'assistant', content: '### H3 Prompt\nA cat runs.', toolCalls: [{ id: 'tc1', function: { name: 'skill', arguments: '{}' } }] },
      { id: 'tool1', role: 'tool', toolCallId: 'tc1', content: 'done' },
    ]);
    expect(rows[0]).toMatchObject({ kind: 'user', text: '拍一只猫' });
    expect(rows[1]).toMatchObject({ kind: 'assistant', tools: [{ id: 'tc1', name: 'skill', status: 'complete' }] });
    expect(rows[1]).toMatchObject({ prompt: { promptText: 'A cat runs.' } });
  });

  it('keeps sent image attachments visible in the user row', () => {
    expect(normalizeMessages([{ id: 'u1', role: 'user', content: '看这张图', attachments: [{ type: 'image', filename: 'ref.png', source: { value: 'data:image/png;base64,a' } }] }])[0]).toMatchObject({ attachments: [{ filename: 'ref.png', displayName: '图片1' }] });
  });

  it('rebuilds a displayable data URI for persisted image content', () => {
    expect(normalizeMessages([{
      id: 'u2',
      role: 'user',
      content: [
        { type: 'text', text: '看这张图' },
        { type: 'image', source: { type: 'data', mimeType: 'image/jpeg', value: 'abc' }, metadata: { filename: 'ref.jpg' } },
      ],
    }])[0]).toMatchObject({ attachments: [{ uri: 'data:image/jpeg;base64,abc', filename: 'ref.jpg' }] });
  });

  it('summarizes tool steps in a collapsed timeline', () => {
    expect(toolTimelineSummary([{ id: 't1', name: 'skill', status: 'running' }])).toBe('正在分析…');
    expect(toolTimelineSummary([{ id: 't1', name: 'skill', status: 'complete' }])).toBe('已完成 1 个步骤');
  });

  it('searches titles and messages and groups by recency', () => {
    const now = Date.now();
    expect(matchesSessionQuery(snapshot(now, '镜头草稿'), '镜头')).toBe(true);
    expect(matchesSessionQuery(snapshot(now), '屋顶')).toBe(true);
    expect(groupSessions([snapshot(now), snapshot(now - 2 * 86400000), snapshot(now - 9 * 86400000)], now).map((group) => group.label)).toEqual(['今天', '近 7 天', '更早']);
  });
});
