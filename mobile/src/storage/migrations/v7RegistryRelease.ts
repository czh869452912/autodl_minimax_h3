import { V7_SCHEMA_STATEMENTS } from '../schema';
import type { MigrationStep } from './types';
import {
  computeWorkflowDigest,
  detectWorkflowRepresentation,
  type WorkflowIdentityScheme,
} from '../../workflows/registry/identity';

type RegistryIdentityRow = {
  workflow_id: string;
  version: string;
  content_hash: string;
  definition_json: string;
  hash_scheme?: string | null;
};

export const v7RegistryRelease: MigrationStep = {
  fromVersion: 6,
  toVersion: 7,
  name: 'v7-registry-release-identities',
  apply({ db, exec, hasColumn }) {
    if (!hasColumn('workflow_registry', 'hash_scheme')) {
      exec('ALTER TABLE workflow_registry ADD COLUMN hash_scheme TEXT');
    }
    for (const statement of V7_SCHEMA_STATEMENTS) exec(statement);

    const rows = db.getAllSync<RegistryIdentityRow>(
      'SELECT workflow_id,version,content_hash,definition_json,hash_scheme FROM workflow_registry',
    );
    for (const row of rows) {
      const payload: unknown = JSON.parse(row.definition_json);
      const representation = detectWorkflowRepresentation(payload);
      const digest = computeWorkflowDigest(payload, representation.scheme);
      if (digest !== row.content_hash) throw new Error('REGISTRY_IDENTITY_DIGEST_MISMATCH');
      if (row.hash_scheme && row.hash_scheme !== representation.scheme) {
        throw new Error('REGISTRY_IDENTITY_SCHEME_MISMATCH');
      }
      db.runSync(
        'UPDATE workflow_registry SET hash_scheme = ? WHERE workflow_id = ? AND version = ?',
        representation.scheme satisfies WorkflowIdentityScheme,
        row.workflow_id,
        row.version,
      );
    }

  },
};
