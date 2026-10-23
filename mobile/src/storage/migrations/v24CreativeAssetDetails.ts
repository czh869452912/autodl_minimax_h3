import { CREATIVE_ASSET_DETAILS_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v24CreativeAssetDetails: MigrationStep = { fromVersion: 23,toVersion:24,name:'v24-creative-asset-details',apply(context){for(const sql of CREATIVE_ASSET_DETAILS_SCHEMA)context.exec(sql);} };
