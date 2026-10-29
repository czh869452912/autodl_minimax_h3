import { createDeepAgent, StateBackend, CompositeBackend } from 'deepagents/browser';
import { createHash } from './sha256.cjs';
globalThis.DeepAgentsProbe = { createDeepAgent, StateBackend, CompositeBackend, hash: createHash('sha256').update(new Uint8Array([0, 255, 128])).digest('hex') };
