import type { LocalThreadSnapshot } from './threadStore';
import { parsePromptResult, type PromptParseResult } from './promptParser';

export type ToolTimelineStep = {
  id: string;
  name: string;
  status: 'running' | 'complete' | 'failed';
  summary?: string;
};
export type PresentationMessage =
  | {
      id: string;
      kind: 'user';
      text: string;
      attachments: Array<{ uri: string; filename?: string }>;
    }
  | {
      id: string;
      kind: 'assistant';
      text: string;
      prompt: PromptParseResult | null;
      tools: ToolTimelineStep[];
    };
export type SessionGroup = {
  label: '今天' | '近 7 天' | '更早';
  snapshots: LocalThreadSnapshot[];
};

function textContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content
      .map((part) =>
        typeof part === 'string' ? part : (part as { text?: unknown })?.text,
      )
      .filter((part): part is string => typeof part === 'string')
      .join('\n');
  return '';
}

function attachmentsContent(
  content: unknown,
  attached?: unknown,
): Array<{ uri: string; filename?: string }> {
  const parts = [
    ...(Array.isArray(content) ? content : []),
    ...(Array.isArray(attached) ? attached : []),
  ];
  const items: Array<{ uri: string; filename?: string } | null> = parts.map(
    (part) => {
      const item = part as {
        type?: string;
        source?: { type?: string; value?: string; url?: string; mimeType?: string };
        image_url?: { url?: string };
        metadata?: { filename?: string };
      };
      const filename =
        item.metadata?.filename ?? (part as { filename?: string }).filename;
      if (item.type === 'image_url' && item.image_url?.url)
        return { uri: item.image_url.url, filename };
      if (item.type !== 'image') return null;
      const sourceValue = item.source?.value ?? item.source?.url;
      if (!sourceValue) return null;
      const uri =
        item.source?.type === 'data' && !sourceValue.startsWith('data:')
          ? `data:${item.source.mimeType ?? 'image/png'};base64,${sourceValue}`
          : sourceValue;
      return { uri, filename };
    },
  );
  return items.filter((item): item is { uri: string; filename?: string } =>
    Boolean(item),
  );
}

function safeSummary(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact ? compact.slice(0, 160) : undefined;
}

export function normalizeMessages(
  messages: readonly unknown[],
): PresentationMessage[] {
  const toolResults = new Map<string, { summary?: string; failed: boolean }>();
  for (const raw of messages) {
    const message = raw as {
      role?: string;
      toolCallId?: string;
      content?: unknown;
    };
    if (
      (message.role === 'tool' || message.role === 'tool_result') &&
      message.toolCallId
    ) {
      const summary = safeSummary(textContent(message.content));
      toolResults.set(message.toolCallId, {
        summary,
        failed: /error|fail|失败/i.test(summary ?? ''),
      });
    }
  }
  const normalized: PresentationMessage[] = [];
  for (const raw of messages) {
    const message = raw as {
      id?: string;
      role?: string;
      content?: unknown;
      attachments?: unknown[];
      toolCalls?: Array<{ id?: string; function?: { name?: string } }>;
    };
    const id = message.id ?? `message-${Math.random().toString(36).slice(2)}`;
    if (message.role === 'user') {
      normalized.push({
        id,
        kind: 'user',
        text: textContent(message.content),
        attachments: attachmentsContent(message.content, message.attachments),
      });
      continue;
    }
    if (message.role !== 'assistant') continue;
    const tools = (message.toolCalls ?? [])
      .filter((call): call is { id: string; function?: { name?: string } } =>
        Boolean(call.id),
      )
      .map((call) => {
        const result = toolResults.get(call.id);
        const status: ToolTimelineStep['status'] = result
          ? result.failed
            ? 'failed'
            : 'complete'
          : 'running';
        return {
          id: call.id,
          name: call.function?.name || '工具调用',
          status,
          summary: result?.summary,
        };
      });
    const text = textContent(message.content);
    normalized.push({
      id,
      kind: 'assistant',
      text,
      prompt: parsePromptResult(text, id),
      tools,
    });
  }
  return normalized;
}

export function toolTimelineSummary(
  steps: readonly ToolTimelineStep[],
): string {
  if (steps.some((step) => step.status === 'running')) return '正在分析…';
  if (steps.some((step) => step.status === 'failed'))
    return `处理失败 · ${steps.length} 个步骤`;
  return `已完成 ${steps.length} 个步骤`;
}

export function sessionTitle(snapshot: LocalThreadSnapshot): string {
  if (snapshot.customTitle?.trim()) return snapshot.customTitle.trim();
  const first = snapshot.messages.find(
    (message) => (message as { role?: string }).role === 'user',
  ) as { content?: unknown } | undefined;
  const text = textContent(first?.content).trim();
  return text ? text.slice(0, 40) : '新会话';
}

export function matchesSessionQuery(
  snapshot: LocalThreadSnapshot,
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [
    sessionTitle(snapshot),
    ...snapshot.messages.map((message) =>
      textContent((message as { content?: unknown }).content),
    ),
  ].some((value) => value.toLocaleLowerCase().includes(normalized));
}

export function groupSessions(
  snapshots: readonly LocalThreadSnapshot[],
  now: number,
): SessionGroup[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const week = today - 6 * 86400000;
  const groups: SessionGroup[] = [
    { label: '今天', snapshots: [] },
    { label: '近 7 天', snapshots: [] },
    { label: '更早', snapshots: [] },
  ];
  for (const snapshot of snapshots) {
    groups[
      snapshot.updatedAt >= today ? 0 : snapshot.updatedAt >= week ? 1 : 2
    ].snapshots.push(snapshot);
  }
  return groups.filter((group) => group.snapshots.length > 0);
}
