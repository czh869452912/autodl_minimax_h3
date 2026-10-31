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

test('host tool policy covers framework tools and denies implicit delegation at execution',async()=>{
 const {creativeToolPolicy,toolPolicyMiddleware}=require('../toolPolicy');
 const policy=creativeToolPolicy();const middleware=toolPolicyMiddleware(policy.entries);
 const handler=jest.fn(async()=>({}));
 await expect(middleware.wrapToolCall({toolCall:{name:'task'}},handler)).rejects.toThrow('TOOL_POLICY_DENIED');
 await expect(middleware.wrapToolCall({toolCall:{name:'execute'}},handler)).rejects.toThrow('TOOL_POLICY_DENIED');
 expect(handler).not.toHaveBeenCalled();
 await middleware.wrapModelCall({tools:[{name:'task'},{name:'read_file'},{name:'generation_submit'}]},handler);
 expect(handler).toHaveBeenCalledWith({tools:[{name:'read_file'},{name:'generation_submit'}]});
 expect(policy.entries.find((e:any)=>e.name==='generation_submit').requires).toBe('structured-authorization');
 expect(policy.entries.find((e:any)=>e.name==='shot_update').effect).toBe('proposal');
});

test('independent reviewer has read-only capabilities and shares durable parent counters',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
  const models:ScriptedModel[]=[];const toolNames:string[][]=[];
  const prepare=createSkillRunPreparer(db as never,config,(c,deps)=>createH3Agent(c,{...deps,modelFactory:(()=>{
   const model=new ScriptedModel(models.length?[new AIMessage('Evidence needs user review')]:[new AIMessage({content:'',tool_calls:[{id:'review',name:'review_project',args:{question:'Review project structure'}}]}),new AIMessage('Review received')]);
   model.bindTools=((tools:any[])=>{toolNames.push(tools.map(t=>t.name));return model;}) as any;
   models.push(model);return model;
  }) as never}));
  const handle=await prepare({threadId:'t',runId:'review-run'},new AbortController().signal,jest.fn());
  try{const result=await (handle.graph as unknown as ReturnType<typeof createH3Agent>).invoke({messages:[{role:'user',content:'Ask reviewer'}]});
   expect(JSON.stringify(result.messages)).toContain('Evidence needs user review');
   expect(models).toHaveLength(2);expect(models[1].received).toHaveLength(1);
   expect(toolNames.some(names=>names.includes('shot_get')&&!names.includes('generation_submit')&&!names.includes('review_project'))).toBe(true);
   expect(db.getFirstSync('SELECT model_calls,tool_calls FROM creative_run_usage')).toEqual({model_calls:3,tool_calls:1});
  }finally{handle.release();}
 }finally{db.close();}
});

test('missing declared capabilities fail before model construction',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
 const store=createSkillStore(db as never);const id=await store.install(validateSkillPackage({'SKILL.md':'---\nname: needs-shell\ndescription: unavailable\nworkbench-capabilities:\n  version: 1\n  tools: [execute]\n---\nCheck.'}));await store.enable(id);
 const factory=jest.fn();await expect(createSkillRunPreparer(db as never,config,factory)({threadId:'t',runId:'r'},new AbortController().signal,jest.fn())).rejects.toThrow('SKILL_CAPABILITY_MISSING');expect(factory).not.toHaveBeenCalled();
 }finally{db.close();}
});
