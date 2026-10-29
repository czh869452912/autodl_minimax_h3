import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createSkillDraftStore } from './draftStore';
import { createSkillStore } from './store';

const input = { goal: 'Review reusable camera instructions', evidence: 'Check subject, action, camera, then list ambiguities.', content: '---\nname: shot-review\ndescription: Review subject and camera instructions\n---\nCheck the subject and camera. Require user review before generation.' };

test('draft survives store recreation, publishes atomically and only explicit enable affects cross-project runs', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const drafts = createSkillDraftStore(db as never), skills = createSkillStore(db as never);
    const draft = await drafts.save(input);
    expect(await createSkillDraftStore(db as never).list()).toEqual([draft]);
    expect(await skills.list()).toEqual([]);
    const id = await drafts.publish(draft);
    expect(await drafts.publish(draft)).toBe(id);
    expect((await skills.capture('project-a-thread', 'before-enable')).versions).toEqual([]);
    await skills.enable(id);
    for (const thread of ['project-a-thread', 'project-b-thread']) {
      const versions = await skills.resolve(await skills.capture(thread, 'after-enable'));
      expect(versions[0].id).toBe(id);
      expect(versions[0].files['SKILL.md']).toBe(input.content);
    }
    await expect(drafts.save({ ...input, content: 'overwrite' }, draft)).rejects.toThrow('草稿已更新');
    await drafts.remove((await drafts.list())[0]);
    expect(await drafts.list()).toEqual([]);
    expect((await skills.list())[0].id).toBe(id);
    expect(db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  } finally { db.close(); }
});

test('stale review cannot publish newer edits or revive a deleted draft', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const store = createSkillDraftStore(db as never);
    const draft = await store.save(input);
    const next = await store.save({ ...input, content: input.content + '\nNew limitation.' }, draft);
    await expect(store.publish(draft)).rejects.toThrow('重新审阅');
    expect(db.getAllSync('SELECT * FROM agent_skill_versions')).toEqual([]);
    await store.remove(next);
    await expect(store.save(input, next)).rejects.toThrow('删除');
  } finally { db.close(); }
});

test('publication rollback leaves no installed skill, evidence may not persist known secrets', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const store = createSkillDraftStore(db as never);
    await expect(store.save({ ...input, evidence: 'api_key=private' })).rejects.toThrow('敏感');
    const draft = await store.save(input);
    db.execSync("CREATE TRIGGER reject_publish BEFORE UPDATE ON agent_skill_drafts BEGIN SELECT RAISE(ABORT,'injected failure'); END");
    await expect(store.publish(draft)).rejects.toThrow('injected failure');
    expect(db.getAllSync('SELECT * FROM agent_skill_versions')).toEqual([]);
    expect((await store.list())[0].publishedVersion).toBeNull();
  } finally { db.close(); }
});
