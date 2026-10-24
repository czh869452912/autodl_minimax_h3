jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(async () => undefined) }));
import * as store from 'expo-secure-store';
import { readCreativeIdea, writeCreativeIdea } from './creativeIdea';
test('restores separate image and video ideas and serializes rapid writes', async () => {
 const idea = {mode:'video' as const,image:'portrait',video:'camera pan'};
 jest.mocked(store.getItemAsync).mockResolvedValue(JSON.stringify(idea));
 expect(await readCreativeIdea()).toEqual(idea);
 await Promise.all([writeCreativeIdea(idea),writeCreativeIdea({...idea,video:'latest'})]);
 expect(store.setItemAsync).toHaveBeenLastCalledWith('creative.home.idea',JSON.stringify({...idea,video:'latest'}));
});
test('rejects malformed recovery instead of silently overwriting it', async () => {
 jest.mocked(store.getItemAsync).mockResolvedValue('{broken');
 await expect(readCreativeIdea()).rejects.toThrow();
});
