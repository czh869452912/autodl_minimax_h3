import { CREATIVE_DELIVERY_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v17CreativeDeliveries: MigrationStep = {
  fromVersion: 16, toVersion: 17, name: 'v17-creative-deliveries',
  apply(context) { for (const sql of CREATIVE_DELIVERY_SCHEMA) context.exec(sql); },
};
