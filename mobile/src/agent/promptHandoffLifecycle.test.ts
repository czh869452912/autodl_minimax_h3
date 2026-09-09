import { createPromptDraftStore } from '../handoff/promptDraft';
import { createAttachmentStore } from '../media/attachments';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';

const hash = 'a'.repeat(64);
const handoff = { prompt: 'Orbit the tower', images: [{ id: 'i1', displayName: 'Tower', uri: 'data:image/png;base64,AQID' }], parameters: {}, source: { threadId: 't', messageId: 'm', versionId: 'v' } };
function setup() {
  const db = createInitializedRealSqliteTestDb();
  let time = 100;
  const assets = createAttachmentStore(db as never, { resolveUri: path => `file:///document/${path}`, importImage: async () => ({ sha256: hash, byteSize: 3, mime: 'image/png', relativePath: `cas/sha256/aa/${hash}` }) });
  const store = createPromptDraftStore(db as never, () => time, assets);
  return { db, store, advance: () => { time += 3600001; } };
}

it('stores binary-free handoffs and transfers ready ownership to a recoverable applied form', async () => {
  const { db, store, advance } = setup();
  try {
    const saved = await store.save({ prompt: handoff.prompt, attachmentIds: ['i1'], handoff });
    expect(db.getAllSync('SELECT * FROM prompt_drafts')).toHaveLength(0);
    expect(db.getFirstSync<any>('SELECT payload_json FROM agent_handoffs').payload_json).not.toContain('base64');
    expect(db.getAllSync('SELECT owner_type FROM artifact_blob_refs')).toEqual([{ owner_type: 'agent_handoff' }]);
    await store.consume(saved.id);
    await store.consume(saved.id);
    advance();
    expect(await store.read(saved.id)).toMatchObject({ id: saved.id, status: 'applied', handoff: { images: [{ uri: expect.stringContaining('/cas/sha256/') }] } });
    expect(db.getAllSync('SELECT owner_type FROM artifact_blob_refs')).toEqual([{ owner_type: 'create_form' }]);
    await store.discard(saved.id);
    expect(await store.read(saved.id)).toBeNull();
    expect(db.getAllSync('SELECT * FROM artifact_blob_refs')).toHaveLength(0);
  } finally { db.close(); }
});

it('expires only unapplied drafts and releases their owners', async () => {
  const { db, store, advance } = setup();
  try {
    const saved = await store.save({ prompt: handoff.prompt, attachmentIds: [], handoff });
    advance();
    expect(await store.read(saved.id)).toBeNull();
    expect(db.getFirstSync('SELECT status FROM agent_handoffs')).toEqual({ status: 'expired' });
    expect(db.getAllSync('SELECT * FROM artifact_blob_refs')).toHaveLength(0);
  } finally { db.close(); }
});

it('rolls back acceptance and ownership when the handoff insert fails', async () => {
  const { db, store } = setup();
  try {
    db.execSync("CREATE TRIGGER reject_handoff BEFORE INSERT ON agent_handoffs BEGIN SELECT RAISE(ABORT,'disk failed'); END");
    await expect(store.save({ prompt: handoff.prompt, attachmentIds: [], handoff })).rejects.toThrow('disk failed');
    expect(db.getAllSync('SELECT * FROM agent_handoffs')).toHaveLength(0);
    expect(db.getAllSync('SELECT * FROM artifact_blob_refs')).toHaveLength(0);
  } finally { db.close(); }
});

it('rolls back applied status when form ownership cannot be retained', async () => {
  const { db, store } = setup();
  try {
    const saved = await store.save({ prompt: handoff.prompt, attachmentIds: [], handoff });
    db.execSync("CREATE TRIGGER reject_form BEFORE INSERT ON artifact_blob_refs WHEN NEW.owner_type='create_form' BEGIN SELECT RAISE(ABORT,'retain failed'); END");
    await expect(store.consume(saved.id)).rejects.toThrow('retain failed');
    expect(db.getFirstSync('SELECT status FROM agent_handoffs')).toEqual({ status: 'ready' });
    expect(db.getAllSync('SELECT owner_type FROM artifact_blob_refs')).toEqual([{ owner_type: 'agent_handoff' }]);
  } finally { db.close(); }
});

it('imports legacy handoffs once and leaves corrupt source rows recoverable', async () => {
  const { db, store } = setup();
  try {
    db.runSync('INSERT INTO prompt_drafts VALUES(?,?,?,?)', 'legacy', handoff.prompt, JSON.stringify({ version: 1, attachmentIds: ['i1'], handoff }), 100);
    expect(await store.read('legacy')).toMatchObject({ id: 'legacy', status: 'ready' });
    expect(await store.read('legacy')).toMatchObject({ id: 'legacy' });
    expect(db.getAllSync('SELECT * FROM agent_handoffs')).toHaveLength(1);
    expect(db.getAllSync('SELECT * FROM prompt_drafts')).toHaveLength(0);
    db.runSync('INSERT INTO prompt_drafts VALUES(?,?,?,?)', 'broken', 'prompt', '{broken', 100);
    await expect(store.read('broken')).rejects.toThrow('交接');
    expect(db.getAllSync('SELECT * FROM prompt_drafts')).toHaveLength(1);
  } finally { db.close(); }
});

it('recovers edited applied forms and rejects late older revisions', async () => {
  const { db, store } = setup();
  try {
    const saved = await store.save({ prompt: handoff.prompt, attachmentIds: [], handoff });
    await store.consume(saved.id);
    const form = { workflowId: 'workflow', values: { prompt: 'edited prompt', duration: 9 }, images: [{ uri: `asset://${hash}`, mime: 'image/png' }], audios: [], revision: 2 };
    await store.saveForm(saved.id, form);
    await store.saveForm(saved.id, { ...form, values: { prompt: 'late old' }, revision: 1 });
    expect(await store.read(saved.id)).toMatchObject({ form: { values: { prompt: 'edited prompt', duration: 9 }, revision: 2 } });
    expect(db.getFirstSync<any>('SELECT payload_json FROM agent_handoffs').payload_json).not.toContain('base64');
    expect(db.getAllSync('SELECT owner_type FROM artifact_blob_refs')).toEqual([{ owner_type: 'create_form' }]);
  } finally { db.close(); }
});
