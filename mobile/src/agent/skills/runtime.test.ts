jest.mock('../../shims/copilotKitStreamingFetch', () => ({ createStreamingFetch: jest.fn() }));
jest.mock('yaml', () => jest.requireActual(require('path').join(require.resolve('yaml/package.json'), '..', 'dist', 'index.js')));
jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn() }));
jest.mock('../DeepSeekCompletions', () => ({ DeepSeekCompletions: jest.fn() }));
import { AIMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createH3Agent } from '../h3Agent';
import { createSkillRunPreparer } from './runtime';
import { createSkillStore } from './store';
import { validateSkillPackage } from './package';
import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';

class ScriptedModel extends BaseChatModel {
  received: any[][] = [];
  constructor(private responses: AIMessage[]) { super({}); }
  _llmType() { return 'local-skill-test'; }
  bindTools() { return this; }
  async _generate(messages: any[]) { this.received.push(messages); return { generations: [{ text: '', message: this.responses.shift() ?? new AIMessage('done') }] }; }
}
const config = { apiKey: 'test', endpoint: 'https://example.test/v1', model: 'test', timeoutMs: 1000, maxRetries: 0 };
const pkg = (body: string) => validateSkillPackage({ 'SKILL.md': `---\nname: scene-review\ndescription: Review scene composition\n---\n${body}` });
test('a real graph discovers and reads the captured skill, rejects writes, and observes revocation', async () => {
  const db = createInitializedRealSqliteTestDb(), store = createSkillStore(db as never);
  try {
    const id = await store.install(pkg('EXACT_VERSION_A')); await store.enable(id);
    const path = `/skills/local-${id.slice(0, 58)}/SKILL.md`;
    const model = new ScriptedModel([
      new AIMessage({ content: '', tool_calls: [{ id: 'read', name: 'read_file', args: { file_path: path } }] }),
      new AIMessage({ content: '', tool_calls: [{ id: 'edit', name: 'write_file', args: { file_path: path, content: 'changed' } }] }),
      new AIMessage('reviewed'),
    ]);
    const prepare = createSkillRunPreparer(db as never, config, (c, deps) => createH3Agent(c, { ...deps, modelFactory: (() => model) as never }));
    const cancel = jest.fn(), handle = await prepare({ threadId: 't', runId: 'r' }, new AbortController().signal, cancel);
    const next = await store.install(pkg('VERSION_B')); await store.enable(next);
    try {
      const graph = handle.graph as unknown as ReturnType<typeof createH3Agent>;
      const result = await graph.invoke({ messages: [{ role: 'user', content: 'Review using the installed scene skill.' }] });
      const tools = result.messages.filter((message: any) => message.getType() === 'tool');
      expect(JSON.stringify(tools[0].content)).toContain('EXACT_VERSION_A');
      expect(JSON.stringify(tools[1].content)).toMatch(/read.only/i);
      expect(JSON.stringify(model.received[0])).toContain('Review scene composition');
      expect(JSON.stringify(model.received)).not.toContain('VERSION_B');
      await store.revoke(id); expect(cancel).toHaveBeenCalledTimes(1);
      const count = model.received.length;
      await expect(graph.invoke({ messages: [{ role: 'user', content: 'continue' }] })).rejects.toThrow(/停用/);
      expect(model.received).toHaveLength(count);
    } finally { handle.release(); }
    const newer = await prepare({ threadId: 't', runId: 'r2' }, new AbortController().signal, jest.fn());
    newer.release();
    expect((await store.runs()).find(run => run.runId === 'r2')?.snapshot.versions[0].id).toBe(next);
  } finally { db.close(); }
});


test('a reviewed extracted version is usable in two project conversations without carrying its source evidence', async () => {
  const db = createInitializedRealSqliteTestDb();
  const { createSkillDraftStore } = require('./draftStore');
  try {
    const drafts = createSkillDraftStore(db), skills = createSkillStore(db as never);
    const draft = await drafts.save({ goal: 'Review scenes', evidence: 'SOURCE_PROJECT_PRIVATE_EXAMPLE', content: pkg('REUSABLE_REVIEW_METHOD').files['SKILL.md'] });
    const id = await drafts.publish(draft); await skills.enable(id);
    for (const project of ['p-a', 'p-b']) {
      const threadId = project + '-thread';
      db.runSync("INSERT INTO creative_projects(id,title,brief,revision,created_at,updated_at) VALUES(?,?, '',0,1,1)", project, project);
      db.runSync('INSERT INTO creative_agent_scopes(thread_id,project_id,revision,updated_at) VALUES(?,?,0,1)', threadId, project);
      const model = new ScriptedModel([
        new AIMessage({ content: '', tool_calls: [{ id: 'read', name: 'read_file', args: { file_path: '/skills/local-' + id.slice(0, 58) + '/SKILL.md' } }] }),
        new AIMessage('reviewed'),
      ]);
      const prepare = createSkillRunPreparer(db as never, config, (c, deps) => createH3Agent(c, { ...deps, modelFactory: (() => model) as never }));
      const handle = await prepare({ threadId, runId: project + '-run' }, new AbortController().signal, jest.fn());
      try {
        const graph = handle.graph as unknown as ReturnType<typeof createH3Agent>;
        const result = await graph.invoke({ messages: [{ role: 'user', content: 'Review this project scene.' }] });
        expect(JSON.stringify(result.messages)).toContain('REUSABLE_REVIEW_METHOD');
        expect(JSON.stringify(model.received)).not.toContain('SOURCE_PROJECT_PRIVATE_EXAMPLE');
      } finally { handle.release(); }
    }
    expect(db.getAllSync('SELECT * FROM creative_budget_reservations')).toEqual([]);
  } finally { db.close(); }
});
