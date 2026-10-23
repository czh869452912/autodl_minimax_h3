import { CREATIVE_AGENT_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v23CreativeAgent: MigrationStep = { fromVersion: 22, toVersion: 23, name: 'v23-creative-agent', apply(context) { for (const sql of CREATIVE_AGENT_SCHEMA) context.exec(sql); } };
