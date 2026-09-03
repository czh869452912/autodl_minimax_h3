import { V6_SCHEMA_STATEMENTS } from '../schema';
import type { MigrationStep } from './types';

const JOB_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['revision', 'INTEGER NOT NULL DEFAULT 0'],
  ['provider_handle_json', 'TEXT'],
  ['last_error_json', 'TEXT'],
  ['next_sync_at', 'INTEGER'],
];

export const v6DurableExecutor: MigrationStep = {
  fromVersion: 5,
  toVersion: 6,
  name: 'v6-durable-executor',
  apply({ db, exec, hasColumn }) {
    for (const statement of V6_SCHEMA_STATEMENTS) exec(statement);
    for (const [column, declaration] of JOB_COLUMNS) {
      if (!hasColumn('workflow_jobs', column)) exec(`ALTER TABLE workflow_jobs ADD COLUMN ${column} ${declaration}`);
    }
    db.runSync('UPDATE workflow_jobs SET provider_handle_json = remote_json WHERE provider_handle_json IS NULL AND remote_json IS NOT NULL');
    db.runSync('UPDATE workflow_jobs SET last_error_json = error_json WHERE last_error_json IS NULL AND error_json IS NOT NULL');
  },
};
