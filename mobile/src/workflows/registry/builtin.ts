import h3Definition from '../definitions/autodl/minimax-h3-i2v-15s.json';
import h3DefinitionV101 from '../definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json';
import h3V100Package from '../definitions/autodl/minimax-h3-i2v-15s-v1.0.0.package.json';
import h3V101Package from '../definitions/autodl/minimax-h3-i2v-15s-v1.0.1.package.json';
import releaseManifestJson from '../definitions/autodl/release-manifest.json';
import type { WorkflowDefinition } from '../schema/types';
import { createWorkflowRegistry } from './repository';
import { createWorkflowCatalog } from './catalog';
import { getDatabase } from '../../storage/databaseClient';
import {
  parseBuiltinReleaseDescriptor,
  type BuiltinWorkflowReleaseSet,
} from './releaseManifest';
import type { WorkflowPackage } from '../schema/package';
import { createWorkflowReleaseCoordinator } from './releaseCoordinator';
import { isWorkflowCompatible } from './service';
import { createReleaseBackup } from '../../storage/backup';

export const builtinWorkflowDefinitions: WorkflowDefinition[] = [h3Definition as WorkflowDefinition, h3DefinitionV101 as WorkflowDefinition];

const builtinPackageFiles = [
  'minimax-h3-i2v-15s-v1.0.0.package.json',
  'minimax-h3-i2v-15s-v1.0.1.package.json',
] as const;

const builtinPackagesByFile: Record<(typeof builtinPackageFiles)[number], WorkflowPackage> = {
  'minimax-h3-i2v-15s-v1.0.0.package.json': h3V100Package as WorkflowPackage,
  'minimax-h3-i2v-15s-v1.0.1.package.json': h3V101Package as WorkflowPackage,
} as const;

const descriptor = parseBuiltinReleaseDescriptor(releaseManifestJson, builtinPackageFiles);

export const builtinWorkflowReleases: BuiltinWorkflowReleaseSet = {
  apiVersion: descriptor.apiVersion,
  releaseId: descriptor.releaseId,
  releases: descriptor.releases.map(({ packageFile, ...release }) => ({
    ...release,
    package: builtinPackagesByFile[packageFile],
  })),
  activation: descriptor.activation,
};

export function createAppWorkflowCatalog() {
  const database = getDatabase();
  const registry = createWorkflowRegistry(database);
  const compatibility = {
    adapters: [{ id: 'autodl-comfyui', operations: ['workflow.submit'] }],
    appVersion: '1.4.10',
    adapterVersions: { 'autodl-comfyui': '1.0.0' },
  };
  const coordinator = createWorkflowReleaseCoordinator({
    registry,
    backup: (releaseId, manifestHash) => createReleaseBackup(database, releaseId, manifestHash),
    now: Date.now,
    isCompatible: (definition) => isWorkflowCompatible(definition, compatibility),
  });
  return createWorkflowCatalog({ registry, coordinator, releaseSet: builtinWorkflowReleases });
}
