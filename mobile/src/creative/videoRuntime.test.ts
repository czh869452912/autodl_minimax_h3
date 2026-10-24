import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import { prepareCreativeVideo } from './videoRuntime';
import definition from '../workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json';
let mockDb: ReturnType<typeof createInitializedRealSqliteTestDb>;
const mockGetActive = jest.fn(async (id: string) => id === definition.id ? { workflowId: definition.id, version: definition.version, contentHash: 'test', definitionJson: JSON.stringify(definition) } : undefined);
jest.mock('../storage/databaseClient', () => ({ getDatabase: () => mockDb }));
jest.mock('../workflows/registry/builtin', () => ({ createAppWorkflowCatalog: () => ({ bootstrap: async () => undefined, getActive: (id: string) => mockGetActive(id) }) }));
jest.mock('./runtime', () => ({ creativeFiles: () => ({ verify: jest.fn() }) }));
jest.mock('./accountRuntime', () => ({ creativeAccounts: () => ({ list: async () => [] }) }));

test.each([false, true])('new and legacy video drafts resolve H3 and reach the account check (legacy=%s)', async legacy => {
  mockDb = createInitializedRealSqliteTestDb();
  try {
    const service = createCreativeService(mockDb as never);
    const result = await service.execute({ name: 'draft.createVideo', payload: { prompt: 'Slow camera pan' } }, 'create');
    if (result.status !== 'completed') throw new Error('Expected draft');
    if (legacy) mockDb.runSync("UPDATE creative_generation_drafts SET workflow_id='minimax_h3_image_audio_to_video_v2_15s'");
    await expect(prepareCreativeVideo(result.value.draftId)).rejects.toThrow('请先绑定 AutoDL 创作凭据');
    expect(mockGetActive).toHaveBeenLastCalledWith(definition.id);
    expect(mockDb.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(0);
  } finally { mockDb.close(); }
});
