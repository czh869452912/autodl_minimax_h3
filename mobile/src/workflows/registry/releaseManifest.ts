import type { WorkflowPackage } from '../schema/package';
import type { WorkflowDefinition } from '../schema/types';
import { parseVerifiedWorkflowPackage } from './service';
import { canonicalizeDefinition } from './canonicalize';
import { sha256Hex } from './crypto';
import { compareVersions } from './semver';
import {
  LEGACY_DEFINITION_IDENTITY_V1,
  WORKFLOW_PACKAGE_IDENTITY_V1,
  type WorkflowIdentityScheme,
} from './identity';
import type { RegistryRecord } from './types';

export type RegistryReleaseErrorCode =
  | 'REGISTRY_RELEASE_MANIFEST_INVALID'
  | 'REGISTRY_RELEASE_DUPLICATE_COORDINATE'
  | 'REGISTRY_RELEASE_DIGEST_MISMATCH'
  | 'REGISTRY_RELEASE_ID_REUSED'
  | 'REGISTRY_STORED_DIGEST_INVALID'
  | 'REGISTRY_IMMUTABLE_VERSION_CONFLICT'
  | 'REGISTRY_ACTIVE_POINTER_INVALID'
  | 'REGISTRY_RELEASE_TARGET_MISSING'
  | 'REGISTRY_RELEASE_BACKUP_FAILED'
  | 'REGISTRY_RELEASE_TRANSACTION_ROLLED_BACK'
  | 'REGISTRY_RELEASE_RECOVERY_REQUIRED';

export class RegistryReleaseError extends Error {
  readonly name = 'RegistryReleaseError';
  readonly cause?: unknown;

  constructor(public readonly code: RegistryReleaseErrorCode, options: { cause?: unknown } = {}) {
    super(code);
    this.cause = options.cause;
  }
}

export type WorkflowIdentity = Readonly<{
  scheme: WorkflowIdentityScheme;
  digest: string;
}>;

export type WorkflowRepresentationFormat = 'legacy-workflow-definition@1' | 'workflow-package@1';

export type AcceptedHistoricalRepresentation = Readonly<{
  workflowId: string;
  version: string;
  identity: WorkflowIdentity;
  format: WorkflowRepresentationFormat;
}>;

export type BuiltinWorkflowRelease = Readonly<{
  package: WorkflowPackage;
  identity: WorkflowIdentity;
  acceptedHistorical?: readonly AcceptedHistoricalRepresentation[];
}>;

export type ReleaseActivationPolicy = Readonly<{
  select: 'highest-compatible-declared-version';
  replaceActiveSources: readonly ['builtin'];
  preserveUnlistedVersions: true;
}>;

export type BuiltinWorkflowReleaseSet = Readonly<{
  apiVersion: 'autodl.workflow-release-set/v1';
  releaseId: string;
  releases: readonly BuiltinWorkflowRelease[];
  activation: ReleaseActivationPolicy;
}>;

type DescriptorRelease<T extends string> = Readonly<{
  packageFile: T;
  identity: WorkflowIdentity;
  acceptedHistorical?: readonly AcceptedHistoricalRepresentation[];
}>;

export type BuiltinReleaseDescriptor<T extends string> = Readonly<{
  apiVersion: 'autodl.workflow-release-set/v1';
  releaseId: string;
  releases: readonly DescriptorRelease<T>[];
  activation: ReleaseActivationPolicy;
}>;

export type PreparedBuiltinRelease = {
  package: WorkflowPackage;
  definition: WorkflowDefinition;
  record: RegistryRecord;
  acceptedHistorical: readonly AcceptedHistoricalRepresentation[];
};

export type PreparedReleaseSet = {
  releaseId: string;
  manifestHash: string;
  releases: readonly PreparedBuiltinRelease[];
  activation: ReleaseActivationPolicy;
};

const digestPattern = /^[0-9a-f]{64}$/;
const releaseIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const schemes = new Set<WorkflowIdentityScheme>([
  LEGACY_DEFINITION_IDENTITY_V1,
  WORKFLOW_PACKAGE_IDENTITY_V1,
]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID');
  }
  return value as Record<string, unknown>;
}

function identity(value: unknown): WorkflowIdentity {
  const candidate = object(value);
  if (!schemes.has(candidate.scheme as WorkflowIdentityScheme) || !digestPattern.test(String(candidate.digest ?? ''))) {
    throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID');
  }
  return { scheme: candidate.scheme as WorkflowIdentityScheme, digest: String(candidate.digest) };
}

function historical(value: unknown): AcceptedHistoricalRepresentation {
  const candidate = object(value);
  const parsedIdentity = identity(candidate.identity);
  if (
    typeof candidate.workflowId !== 'string'
    || typeof candidate.version !== 'string'
    || (candidate.format !== 'legacy-workflow-definition@1' && candidate.format !== 'workflow-package@1')
    || (candidate.format === 'legacy-workflow-definition@1' && parsedIdentity.scheme !== LEGACY_DEFINITION_IDENTITY_V1)
    || (candidate.format === 'workflow-package@1' && parsedIdentity.scheme !== WORKFLOW_PACKAGE_IDENTITY_V1)
  ) throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID');
  return {
    workflowId: candidate.workflowId,
    version: candidate.version,
    format: candidate.format,
    identity: parsedIdentity,
  };
}

function activation(value: unknown): ReleaseActivationPolicy {
  const candidate = object(value);
  if (
    candidate.select !== 'highest-compatible-declared-version'
    || candidate.preserveUnlistedVersions !== true
    || !Array.isArray(candidate.replaceActiveSources)
    || candidate.replaceActiveSources.length !== 1
    || candidate.replaceActiveSources[0] !== 'builtin'
  ) throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID');
  return {
    select: 'highest-compatible-declared-version',
    replaceActiveSources: ['builtin'],
    preserveUnlistedVersions: true,
  };
}

export function parseBuiltinReleaseDescriptor<const T extends string>(
  value: unknown,
  knownPackageFiles: readonly T[],
): BuiltinReleaseDescriptor<T> {
  const candidate = object(value);
  if (
    candidate.apiVersion !== 'autodl.workflow-release-set/v1'
    || typeof candidate.releaseId !== 'string'
    || !releaseIdPattern.test(candidate.releaseId)
    || !Array.isArray(candidate.releases)
    || candidate.releases.length === 0
  ) throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID');

  const known = new Set<string>(knownPackageFiles);
  const seen = new Set<string>();
  const releases = candidate.releases.map((raw): DescriptorRelease<T> => {
    const release = object(raw);
    if (typeof release.packageFile !== 'string' || !known.has(release.packageFile) || seen.has(release.packageFile)) {
      throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID');
    }
    seen.add(release.packageFile);
    return {
      packageFile: release.packageFile as T,
      identity: identity(release.identity),
      acceptedHistorical: release.acceptedHistorical === undefined
        ? undefined
        : (Array.isArray(release.acceptedHistorical)
          ? release.acceptedHistorical.map(historical)
          : (() => { throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID'); })()),
    };
  });
  if (seen.size !== known.size) throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID');
  return {
    apiVersion: 'autodl.workflow-release-set/v1',
    releaseId: candidate.releaseId,
    releases,
    activation: activation(candidate.activation),
  };
}

function validateHistoricalDeclarations(
  release: BuiltinWorkflowRelease,
  definition: WorkflowDefinition,
): readonly AcceptedHistoricalRepresentation[] {
  const seen = new Set<string>();
  return (release.acceptedHistorical ?? []).map((item) => {
    if (item.workflowId !== definition.id || item.version !== definition.version) {
      throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID');
    }
    const parsed = historical(item);
    const key = `${parsed.format}\u0000${parsed.identity.scheme}\u0000${parsed.identity.digest}`;
    if (seen.has(key)) throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID');
    seen.add(key);
    return parsed;
  });
}

function normalizeReleaseSet(set: BuiltinWorkflowReleaseSet): unknown {
  return JSON.parse(JSON.stringify({
    apiVersion: set.apiVersion,
    releaseId: set.releaseId,
    releases: set.releases,
    activation: set.activation,
  }));
}

export async function prepareBuiltinReleaseSet(set: BuiltinWorkflowReleaseSet): Promise<PreparedReleaseSet> {
  if (set.apiVersion !== 'autodl.workflow-release-set/v1' || !releaseIdPattern.test(set.releaseId)) {
    throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID');
  }
  const coordinates = new Set<string>();
  const releases: PreparedBuiltinRelease[] = [];
  for (const release of set.releases) {
    const verified = await parseVerifiedWorkflowPackage(release.package, 'builtin');
    const coordinate = `${verified.definition.id}\u0000${verified.definition.version}`;
    if (coordinates.has(coordinate)) throw new RegistryReleaseError('REGISTRY_RELEASE_DUPLICATE_COORDINATE');
    coordinates.add(coordinate);
    if (release.identity.scheme !== WORKFLOW_PACKAGE_IDENTITY_V1 || release.identity.digest !== verified.packageHash) {
      throw new RegistryReleaseError('REGISTRY_RELEASE_DIGEST_MISMATCH');
    }
    releases.push({
      package: verified.pkg,
      definition: verified.definition,
      record: {
        workflowId: verified.definition.id,
        version: verified.definition.version,
        contentHash: verified.packageHash,
        hashScheme: release.identity.scheme,
        source: 'builtin',
        trust: 'builtin',
        definitionJson: canonicalizeDefinition(JSON.parse(JSON.stringify(verified.pkg))),
        installedAt: 0,
      },
      acceptedHistorical: validateHistoricalDeclarations(release, verified.definition),
    });
  }
  const ordered = releases.map(({ record }) => ({ workflowId: record.workflowId, version: record.version }));
  const sorted = [...ordered].sort((left, right) =>
    left.workflowId.localeCompare(right.workflowId) || compareVersions(left.version, right.version),
  );
  if (ordered.some((item, index) =>
    item.workflowId !== sorted[index].workflowId || item.version !== sorted[index].version
  )) throw new RegistryReleaseError('REGISTRY_RELEASE_MANIFEST_INVALID');
  const manifestHash = await sha256Hex(canonicalizeDefinition(normalizeReleaseSet(set)));
  return { releaseId: set.releaseId, manifestHash, releases, activation: set.activation };
}

export function collectManifestLiveHashes(prepared: PreparedReleaseSet): Set<string> {
  return new Set(prepared.releases.flatMap((release) => [
    release.record.contentHash,
    ...release.acceptedHistorical.map((item) => item.identity.digest),
  ]));
}
