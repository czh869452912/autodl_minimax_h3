import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createSkillStore, onSkillRevoked } from './store';
import { validateSkillPackage } from './package';
const pkg = (body: string) => validateSkillPackage({ 'SKILL.md': `---\nname: scene-review\ndescription: Review scenes\n---\n${body}` });

test('explicit binding, immutable run snapshots, version replacement and revocation remain separate', async () => {
  const db = createInitializedRealSqliteTestDb(), store = createSkillStore(db as never);
  try {
    const a = await store.install(pkg('A')); expect((await store.capture('thread', 'r0')).versions).toEqual([]);
    await store.enable(a); const first = await store.capture('thread', 'r1');
    const b = await store.install(pkg('B')); expect(await store.install(pkg('A'))).toBe(a);
    await store.enable(b); const second = await store.capture('thread', 'r2');
    expect((await store.resolve(first))[0].files['SKILL.md']).toContain('\nA');
    expect(second.versions[0].id).toBe(b);
    expect(await store.capture('thread', 'r1')).toEqual(first);
    expect(() => db.runSync('UPDATE agent_skill_versions SET files_json=? WHERE id=?', '{}', a)).toThrow(/IMMUTABLE/);
    const revoked = jest.fn(), release = onSkillRevoked(revoked); await store.revoke(a); release();
    expect(revoked).toHaveBeenCalledWith(a);
    await expect(store.resolve(first)).rejects.toThrow(/停用/);
    expect((await store.resolve(second))[0].id).toBe(b);
    await store.enable(a); await expect(store.resolve(first)).rejects.toThrow(/停用/);
    expect((await store.capture('thread', 'r3')).versions[0].revocation).toBe(1);
    db.runSync('UPDATE creative_execution_state SET epoch=?', 'restored');
    await expect(store.resolve(second)).rejects.toThrow(/不可恢复/);
  } finally { db.close(); }
});
test('failed installation publishes nothing and a failed binding leaves the old version enabled', async () => {
  const db = createInitializedRealSqliteTestDb(), store = createSkillStore(db as never);
  try {
    await expect(store.install({ ...pkg('A'), files: { 'SKILL.md': 'invalid' } })).rejects.toThrow();
    expect(await store.list()).toEqual([]);
    const a = await store.install(pkg('A')); await store.enable(a);
    const b = await store.install(pkg('B'));
    db.execSync("CREATE TRIGGER reject_binding BEFORE UPDATE ON agent_skill_bindings BEGIN SELECT RAISE(ABORT,'disk'); END");
    await expect(store.enable(b)).rejects.toThrow('disk');
    expect((await store.list()).filter(v => v.enabled).map(v => v.id)).toEqual([a]);
  } finally { db.close(); }
});

test('project overrides pin versions, exclude global skills and preserve existing run snapshots',async()=>{
 const db=createInitializedRealSqliteTestDb(),store=createSkillStore(db as never);try{
  for(const p of ['p','q'])db.runSync('INSERT INTO creative_projects VALUES(?,?,?,0,NULL,1,1)',p,p,'');
  db.runSync("INSERT INTO creative_agent_scopes VALUES('p-thread','p',0,1)");
  db.runSync("INSERT INTO creative_agent_scopes VALUES('q-thread','q',0,1)");
  const a=await store.install(pkg('A')),b=await store.install(pkg('B'));await store.enable(a);
  await store.setProjectVersion('p','scene-review',b);
  const pinned=await store.capture('p-thread','first');
  expect(pinned.versions[0].id).toBe(b);expect((await store.capture('q-thread','first')).versions[0].id).toBe(a);
  await store.setProjectVersion('p','scene-review',null);
  expect((await store.capture('p-thread','second')).versions).toEqual([]);
  expect((await store.resolve(pinned))[0].id).toBe(b);
  await store.setProjectVersion('p','scene-review',undefined);
  expect((await store.capture('p-thread','third')).versions[0].id).toBe(a);
  await store.setProjectVersion('p','scene-review',b);await store.revoke(b);
  expect((await store.capture('p-thread','fourth')).versions).toEqual([]);
  await expect(store.resolve(pinned)).rejects.toThrow('停用');
 }finally{db.close();}
});
