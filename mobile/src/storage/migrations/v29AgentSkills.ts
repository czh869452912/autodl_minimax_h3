import { AGENT_SKILL_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v29AgentSkills: MigrationStep = {
  fromVersion: 28, toVersion: 29, name: 'v29-agent-skills',
  apply(context) { for (const sql of AGENT_SKILL_SCHEMA) context.exec(sql); },
};
