import SHA256 from 'crypto-js/sha256';
import encHex from 'crypto-js/enc-hex';
import { canonicalizeDefinition } from './canonicalize';
import { parseWorkflowPackage } from '../schema/package';

export const LEGACY_DEFINITION_IDENTITY_V1 = 'workflow-definition/sorted-json@1' as const;
export const WORKFLOW_PACKAGE_IDENTITY_V1 = 'workflow-package/without-declared-hash+sorted-json@1' as const;

export type WorkflowIdentityScheme =
  | typeof LEGACY_DEFINITION_IDENTITY_V1
  | typeof WORKFLOW_PACKAGE_IDENTITY_V1;

export type WorkflowRepresentation = {
  format: 'legacy-workflow-definition@1' | 'workflow-package@1';
  scheme: WorkflowIdentityScheme;
};

function cloneWithoutDeclaredHash(value: unknown): unknown {
  const pkg = parseWorkflowPackage(value);
  const { contentHash: _contentHash, ...metadata } = pkg.metadata;
  return JSON.parse(JSON.stringify({ ...pkg, metadata }));
}

function assertLegacyDefinition(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('REGISTRY_IDENTITY_FORMAT_UNKNOWN');
  }
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== '1.0' || typeof row.id !== 'string' || typeof row.version !== 'string' || row.kind !== 'atomic') {
    throw new Error('REGISTRY_IDENTITY_FORMAT_UNKNOWN');
  }
  for (const key of ['platform', 'metadata', 'inputs', 'request', 'outputs']) {
    if (!row[key] || typeof row[key] !== 'object') throw new Error('REGISTRY_IDENTITY_FORMAT_UNKNOWN');
  }
}

export function detectWorkflowRepresentation(value: unknown): WorkflowRepresentation {
  if (
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { apiVersion?: unknown }).apiVersion === 'workflow.autodl/v1'
  ) {
    parseWorkflowPackage(value);
    return { format: 'workflow-package@1', scheme: WORKFLOW_PACKAGE_IDENTITY_V1 };
  }
  assertLegacyDefinition(value);
  return { format: 'legacy-workflow-definition@1', scheme: LEGACY_DEFINITION_IDENTITY_V1 };
}

export function computeWorkflowDigest(value: unknown, scheme: WorkflowIdentityScheme): string {
  const projected = scheme === WORKFLOW_PACKAGE_IDENTITY_V1 ? cloneWithoutDeclaredHash(value) : value;
  if (scheme === LEGACY_DEFINITION_IDENTITY_V1) assertLegacyDefinition(projected);
  const canonical = canonicalizeDefinition(JSON.parse(JSON.stringify(projected)));
  return SHA256(canonical).toString(encHex);
}
