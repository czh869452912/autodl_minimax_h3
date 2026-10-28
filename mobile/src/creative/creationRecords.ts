import type { AppDatabase } from '../storage/appDatabase';
import type { CreativeDraft } from './drafts';

/** Count the entire session in SQLite; transfer only its newest editable snapshot. */
export async function readCreationRecords(db: AppDatabase) {
  const rows = await db.getAllAsync<CreativeDraft & { generations: number }>(`
    WITH eligible AS (
      SELECT d.*, CASE WHEN provider_id != 'novelai' AND json_extract(input_json,'$.schemaVersion')=2
        THEN json_extract(input_json,'$.sessionId') ELSE COALESCE(target_asset_id,id) END AS session_key
      FROM creative_generation_drafts d WHERE state!='DISCARDED'
      AND (job_id IS NOT NULL OR target_asset_id IS NOT NULL OR shot_id IS NOT NULL
        OR length(trim(COALESCE(json_extract(input_json,'$.prompt'),'')))>0
        OR json_extract(input_json,'$.sourceVersionId') IS NOT NULL
        OR EXISTS(SELECT 1 FROM creative_draft_inputs i WHERE i.draft_id=d.id)
        OR EXISTS(SELECT 1 FROM json_each(input_json,'$.characters') c
          WHERE json_extract(c.value,'$.enabled')=1 AND length(trim(json_extract(c.value,'$.prompt')))>0))
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY provider_id,project_id,shot_id,session_key ORDER BY updated_at DESC,id DESC) AS position,
        COUNT(job_id) OVER (PARTITION BY provider_id,project_id,shot_id,session_key) AS generations FROM eligible
    ) SELECT * FROM ranked WHERE position=1 ORDER BY updated_at DESC,id DESC
  `);
  return rows.map(({ generations, ...draft }) => ({ draft, generations }));
}
