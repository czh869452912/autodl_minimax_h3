import { canonicalizeDefinition } from './canonicalize';
import { sha256Hex } from './hash';
import { compareVersions, satisfiesVersion } from './semver';
import type { RegistrySource } from './types';
import type { WorkflowDefinition, PlatformAdapterManifest } from '../schema/types';
import { legacyDefinitionToPackage, parseWorkflowPackage, packageToDefinition, type WorkflowPackage } from '../schema/package';

export class RegistryError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = 'RegistryError'; } }

export type WorkflowCompatibilityContext = { adapters: Array<Pick<PlatformAdapterManifest, 'id' | 'operations'>>; appVersion: string; adapterVersions?: Record<string, string>; adapterArtifactKinds?: Record<string, string[]> };

export function isWorkflowCompatible(
  definition: WorkflowDefinition,
  context: WorkflowCompatibilityContext,
): boolean {
  const adapter = context.adapters.find((item) => item.id === definition.platform.adapter);
  if (!adapter || !adapter.operations.includes(definition.platform.operation)) return false;
  const compatibility = definition.compatibility;
  if (compatibility?.minAppVersion && compareVersions(context.appVersion, compatibility.minAppVersion) < 0) return false;
  const adapterVersion = context.adapterVersions?.[definition.platform.adapter];
  if (compatibility?.requiredAdapterVersion && (!adapterVersion || !satisfiesVersion(adapterVersion, compatibility.requiredAdapterVersion))) return false;
  const supported = context.adapterArtifactKinds?.[definition.platform.adapter];
  if (supported && compatibility?.artifactKinds?.some((kind) => !supported.includes(kind))) return false;
  return true;
}

export type WorkflowPackageSource = RegistrySource | 'git';
export type VerifiedWorkflowPackage = { pkg: WorkflowPackage; definition: WorkflowDefinition; packageHash: string };

export const canonicalizePackage = (pkg: WorkflowPackage): string => canonicalizeDefinition(JSON.parse(JSON.stringify(pkg)));

export async function parseVerifiedWorkflowPackage(input: unknown, source: WorkflowPackageSource): Promise<VerifiedWorkflowPackage> {
  let pkg: WorkflowPackage;
  if (input && typeof input === 'object' && (input as Record<string, unknown>).apiVersion === 'workflow.autodl/v1') {
    pkg = parseWorkflowPackage(input);
  } else if (source === 'builtin') {
    pkg = legacyDefinitionToPackage(input as WorkflowDefinition);
  } else {
    throw new RegistryError('REGISTRY_PACKAGE_REQUIRED', 'non-builtin workflow content must be a declarative WorkflowPackage');
  }
  const { contentHash: _declaredHash, ...metadataWithoutHash } = pkg.metadata;
  const canonicalInput = JSON.parse(JSON.stringify({ ...pkg, metadata: metadataWithoutHash }));
  const canonical = canonicalizeDefinition(canonicalInput);
  const packageHash = await sha256Hex(canonical);
  if (pkg.metadata.contentHash && pkg.metadata.contentHash !== packageHash) {
    throw new RegistryError('REGISTRY_HASH_MISMATCH', 'workflow package content hash does not match canonical package');
  }
  return { pkg, definition: packageToDefinition(pkg), packageHash };
}
