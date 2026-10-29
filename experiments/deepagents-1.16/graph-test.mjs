import assert from 'node:assert/strict';
import { createDeepAgent, StateBackend } from 'deepagents/browser';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';
class Model extends BaseChatModel {
  seen = [];
  _llmType() { return 'offline-probe'; }
  bindTools() { return this; }
  async _generate(messages) { this.seen.push(messages); return { generations: [{ text: 'done', message: new AIMessage('done') }] }; }
}
const model = new Model({});
const agent = createDeepAgent({ model, backend: new StateBackend(), skills: ['/skills/'] });
const files = text => ({ '/skills/probe/SKILL.md': { content: `---\nname: probe\ndescription: Offline skill probe\n---\n${text}`, mimeType: 'text/plain', created_at: '', modified_at: '' } });
await agent.invoke({ messages: [{ role: 'user', content: 'Inspect' }], files: files('VERSION_A'), pinnedSkills: ['probe'] });
assert.match(JSON.stringify(model.seen[0]), /VERSION_A/);
await agent.invoke({ messages: [{ role: 'user', content: 'Inspect' }], files: files('VERSION_B'), pinnedSkills: ['probe'], skillsMetadata: null });
assert.match(JSON.stringify(model.seen.at(-1)), /VERSION_B/);
assert.doesNotMatch(JSON.stringify(model.seen.at(-1)), /VERSION_A/);
console.log('Offline candidate graph: pinned skill and explicit refresh passed');
