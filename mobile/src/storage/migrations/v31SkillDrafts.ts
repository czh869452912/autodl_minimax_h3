import { AGENT_SKILL_DRAFT_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v31SkillDrafts: MigrationStep = {
  fromVersion: 30, toVersion: 31, name: 'v31-skill-drafts',
  apply(context) { for (const sql of AGENT_SKILL_DRAFT_SCHEMA) context.exec(sql); },
};
