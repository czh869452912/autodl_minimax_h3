import CryptoJS from 'crypto-js';
import { HumanMessage, coerceMessageLikeToMessage } from '@langchain/core/messages';
import { createMiddleware, todoListMiddleware, countTokensApproximately } from 'langchain';
import { CompositeBackend, StateBackend, createSummarizationMiddleware, type FileData, type BackendProtocolV2 } from 'deepagents/browser';
import { z } from 'zod';
import { getOfficialH3SkillFiles } from './skillBundle';
import { H3_GRAPH_VERSION, getH3ContextBudget, type H3ContextBudget } from './agentTypes';
export { getH3ContextBudget, type H3ContextBudget } from './agentTypes';

export { H3_GRAPH_VERSION } from './agentTypes';
const MAX_WORKSPACE_BYTES = 1024 * 1024;
const MAX_SUMMARY_BYTES = 16 * 1024;
export type H3WorkspaceRecord = {
  schemaVersion: 1; graphVersion: string; skillVersion: string; budgetKey: string; revision: number;
  files: Record<string, { content: string; mimeType: string; created_at: string; modified_at: string }>;
  todos: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed' }>;
  summary?: { cutoffIndex: number; prefixHash: string; throughMessageId: string; content: string; filePath: string | null; sessionId: string };
};

const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const byteSize = (value: string) => CryptoJS.enc.Utf8.parse(value).sigBytes;
const digest = (value: string) => CryptoJS.SHA256(value).toString(CryptoJS.enc.Hex);
let skillVersion: string | undefined;
function currentSkillVersion(): string {
  return skillVersion ??= digest(JSON.stringify(getOfficialH3SkillFiles()));
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
function prefixHash(messages: readonly unknown[], cutoff: number): string {
  return digest(JSON.stringify(messages.slice(0, cutoff).map(value => {
    const message = coerceMessageLikeToMessage(value as never);
    const data = message as any;
    return stable({ role: message.getType(), content: message.content, tool_calls: data.tool_calls ?? [], tool_call_id: data.tool_call_id ?? null });
  })));
}
const budgetKey = (budget: H3ContextBudget) => `${budget.inputTokens}:${budget.outputTokens}:budget-1`;

// The installed public legacy constructor permits an immutable in-memory
// bundle reader. All mutations are denied here, outside the model tool layer.
class ReadOnlySkillsBackend extends StateBackend {
  write() { return { error: 'Read-only skills cannot be modified' }; }
  edit() { return { error: 'Read-only skills cannot be modified' }; }
  delete() { return { error: 'Read-only skills cannot be modified' }; }
  uploadFiles(files: Array<[string, Uint8Array]>) {
    return files.map(([path]) => ({ path, error: 'permission_denied' as const }));
  }
}
export function createH3WorkspaceBackend(): CompositeBackend {
  const files = Object.fromEntries(Object.entries(getOfficialH3SkillFiles()).map(([path, file]) => [path.slice('/skills'.length), file]));
  return new CompositeBackend(new StateBackend(), { '/skills/': new ReadOnlySkillsBackend({ state: { files } }) });
}

function copyFiles(value: unknown): H3WorkspaceRecord['files'] {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('Invalid workspace files');
  const output: H3WorkspaceRecord['files'] = {};
  let bytes = 0;
  for (const [path, raw] of Object.entries(record(value))) {
    if (path === '/skills' || path.startsWith('/skills/')) continue;
    if (!path.startsWith('/') || path.includes('..') || path.includes('\\') || path.includes('\0')) throw new Error('Invalid workspace file path');
    const file = record(raw);
    if (typeof file.content !== 'string' || /data:[^;]+;base64,/i.test(file.content)) throw new Error('Workspace files must contain text without inline binary');
    bytes += byteSize(file.content) + byteSize(path);
    if (bytes > MAX_WORKSPACE_BYTES) throw new Error('Workspace byte budget exceeded');
    output[path] = { content: file.content, mimeType: typeof file.mimeType === 'string' ? file.mimeType : 'text/plain', created_at: typeof file.created_at === 'string' ? file.created_at : '', modified_at: typeof file.modified_at === 'string' ? file.modified_at : '' };
  }
  return output;
}
const todosSchema = z.array(z.object({ content: z.string().max(2000), status: z.enum(['pending', 'in_progress', 'completed']) })).max(100);
const summarySchema = z.object({ cutoffIndex: z.number().int().positive(), prefixHash: z.string().regex(/^[a-f0-9]{64}$/), throughMessageId: z.string(), content: z.string(), filePath: z.string().nullable(), sessionId: z.string().max(200) });

export function captureWorkspaceState(value: unknown, revision: number, budget = getH3ContextBudget()): H3WorkspaceRecord {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid workspace revision');
  const state = record(value);
  const output: H3WorkspaceRecord = { schemaVersion: 1, graphVersion: H3_GRAPH_VERSION, skillVersion: currentSkillVersion(), budgetKey: budgetKey(budget), revision, files: copyFiles(state.files), todos: todosSchema.parse(state.todos ?? []) };
  const event = record(state._summarizationEvent);
  const messages: unknown[] = Array.isArray(state.messages) ? state.messages : [];
  if (Number.isInteger(event.cutoffIndex) && event.cutoffIndex > 0 && event.cutoffIndex <= messages.length && typeof event.summaryMessage?.content === 'string') {
    const content = event.summaryMessage.content;
    if (byteSize(content) > MAX_SUMMARY_BYTES) throw new Error('Summary byte budget exceeded');
    const filePath = typeof event.filePath === 'string' && output.files[event.filePath] ? event.filePath : null;
    output.summary = summarySchema.parse({ cutoffIndex: event.cutoffIndex, prefixHash: prefixHash(messages, event.cutoffIndex), throughMessageId: record(messages[event.cutoffIndex - 1]).id ?? '', content, filePath, sessionId: state._summarizationSessionId ?? '' });
  }
  return output;
}

export function prepareWorkspaceRun(workspace: unknown, messages: readonly unknown[], budget = getH3ContextBudget()) {
  const context: { h3Summary?: { event: { cutoffIndex: number; summaryMessage: HumanMessage; filePath: string | null }; sessionId: string } } = {};
  let files: H3WorkspaceRecord['files'] = {};
  let todos: H3WorkspaceRecord['todos'] = [];
  if (workspace != null) {
    const saved = record(workspace);
    if (saved.schemaVersion !== 1 || saved.graphVersion !== H3_GRAPH_VERSION) throw new Error('Unsupported workspace codec version');
    files = copyFiles(saved.files);
    todos = todosSchema.parse(saved.todos ?? []);
    if (saved.summary && saved.skillVersion === currentSkillVersion() && saved.budgetKey === budgetKey(budget)) {
      const parsed = summarySchema.safeParse(saved.summary);
      if (parsed.success) {
        const summary = parsed.data;
        if (summary.cutoffIndex <= messages.length && byteSize(summary.content) <= MAX_SUMMARY_BYTES && prefixHash(messages, summary.cutoffIndex) === summary.prefixHash && (!summary.filePath || files[summary.filePath])) {
          context.h3Summary = { sessionId: summary.sessionId, event: { cutoffIndex: summary.cutoffIndex, summaryMessage: new HumanMessage({ content: summary.content, additional_kwargs: { lc_source: 'summarization' } }), filePath: summary.filePath } };
        }
      }
    }
  }
  return { input: { messages: [...messages], files: files as Record<string, FileData>, todos }, context };
}

export function createH3WorkspaceMiddleware(backend: BackendProtocolV2, budget = getH3ContextBudget()) {
  const eventSchema = z.object({ cutoffIndex: z.number().int().positive(), summaryMessage: z.instanceof(HumanMessage), filePath: z.string().nullable() });
  return [
    todoListMiddleware(),
    createSummarizationMiddleware({ backend, trigger: { type: 'tokens', value: Math.floor(budget.inputTokens * 0.8) }, keep: { type: 'tokens', value: Math.floor(budget.inputTokens * 0.25) }, trimTokensToSummarize: Math.max(1024, budget.inputTokens - 2048) }),
    createMiddleware({
      name: 'H3WorkspaceRestore',
      stateSchema: z.object({ _summarizationEvent: eventSchema.optional(), _summarizationSessionId: z.string().optional() }),
      contextSchema: z.object({ h3Summary: z.object({ event: eventSchema, sessionId: z.string() }).optional() }),
      beforeAgent: (_state, runtime) => runtime.context.h3Summary ? { _summarizationEvent: runtime.context.h3Summary.event, _summarizationSessionId: runtime.context.h3Summary.sessionId } : undefined,
    }),
    createMiddleware({
      name: 'H3ContextBudget',
      wrapModelCall: (request, handler) => {
        // Summaries replace text, but referenced image inputs still need their
        // original visual data. The selected transcript is the image authority.
        const visibleIds = new Set(request.messages.map(message => message.id));
        const retainedImages = request.state.messages.filter(message => !visibleIds.has(message.id) && Array.isArray(message.content) && message.content.some(part => typeof part === 'object' && (part.type === 'image' || part.type === 'image_url')));
        const modelMessages = [...retainedImages, ...request.messages];
        const messages = request.systemMessage ? [request.systemMessage, ...modelMessages] : modelMessages;
        const images = messages.reduce((count, message) => count + (Array.isArray(message.content) ? message.content.filter(part => typeof part === 'object' && (part.type === 'image' || part.type === 'image_url')).length : 0), 0);
        const estimate = countTokensApproximately(messages, request.tools) + images * 2048;
        if (estimate + 1024 > budget.inputTokens) throw new Error('Model input exceeds the configured context budget');
        return handler({ ...request, messages: modelMessages });
      },
    }),
  ];
}
