import {runUsageMiddleware} from '../runUsage';
import {getH3ContextBudget} from '../agentTypes';
import CryptoJS from 'crypto-js';
import {pinRunRuntime,assertRunAuthority} from '../runSpecification';
import {creativeToolPolicy} from '../toolPolicy';
import type { FileData } from 'deepagents/browser';
import { getOfficialH3SkillFiles } from '../skillBundle';
import { createH3Agent } from '../h3Agent';
import type { H3AgentConfig } from '../agentTypes';
import * as workspace from '../agentWorkspace';
import { createSkillStore, onSkillRevoked, type SkillVersion } from './store';
import type { AppDatabase } from '../../storage/appDatabase';

export function skillFiles(versions: SkillVersion[]): Record<string, FileData> {
  return Object.fromEntries(versions.flatMap(version => Object.entries(version.files).map(([path, text]) => [
    `/skills/local-${version.id.slice(0, 58)}/${path}`,
    { content: path === 'SKILL.md' ? text.replace(/^---\n[\s\S]*?\n---(?:\n|$)/, `---\nname: local-${version.id.slice(0, 58)}\ndescription: ${JSON.stringify(version.description)}\n---\n`) : text, mimeType: 'text/plain', created_at: '', modified_at: '' },
  ])));
}

export function createSkillRunPreparer(db: AppDatabase, config: H3AgentConfig, createGraph = createH3Agent) {
  const store = createSkillStore(db);
  return async (input: { threadId: string; runId: string }, signal: AbortSignal, cancel: () => void) => {
    await assertRunAuthority(db,input.threadId,input.runId);
    const snapshot = await store.capture(input.threadId, input.runId);
    const unsubscribe = onSkillRevoked(id => { if (snapshot.versions.some(ref => ref.id === id)) cancel(); });
    const release = () => { unsubscribe(); signal.removeEventListener('abort', release); };
    signal.addEventListener('abort', release, { once: true });
    try {
      const versions = await store.resolve(snapshot);
      if (signal.aborted) throw new Error('运行已停止');
      const available=new Set(creativeToolPolicy().entries.map(e=>e.name));
      for(const version of versions){const missing=version.capabilities?.tools.filter(t=>!available.has(t))??[];if(missing.length)throw new Error('SKILL_CAPABILITY_MISSING: '+version.name+' / '+missing.join(', '));}
      const files = skillFiles(versions);
      const version = CryptoJS.SHA256(JSON.stringify({ ...getOfficialH3SkillFiles(), ...files })).toString();
      await pinRunRuntime(db,input.threadId,input.runId,config,version,creativeToolPolicy().entries.map(t=>JSON.stringify(t)));
      return {
        graph: createGraph(config, { runMiddleware:[runUsageMiddleware(db,input.threadId,input.runId,getH3ContextBudget(config).outputTokens)], skillFiles: files, assertSkills: async () => { await assertRunAuthority(db,input.threadId,input.runId);await store.resolve(snapshot); } }) as never,
        workspace: {
          prepareWorkspaceRun: (saved: unknown, messages: readonly unknown[], budget?: workspace.H3ContextBudget) => workspace.prepareWorkspaceRun(saved, messages, budget, version),
          captureWorkspaceState: (state: unknown, revision: number, budget?: workspace.H3ContextBudget) => workspace.captureWorkspaceState(state, revision, budget, version),
        },
        release,
      };
    } catch (error) { release(); throw error; }
  };
}
