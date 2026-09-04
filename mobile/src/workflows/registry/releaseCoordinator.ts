import type { WorkflowDefinition } from '../schema/types';
import { compareVersions } from './semver';
import type { RegistryRecord, WorkflowRegistry } from './types';
import {
  RegistryReleaseError,
  prepareBuiltinReleaseSet,
  type BuiltinWorkflowReleaseSet,
  type PreparedBuiltinRelease,
  type PreparedReleaseSet,
  type WorkflowIdentity,
} from './releaseManifest';
import { computeWorkflowDigest, detectWorkflowRepresentation } from './identity';

export type ReleaseReconcileResult =
  | { status: 'unchanged' }
  | {
      status: 'updated';
      installed: ReadonlyArray<{ workflowId: string; version: string }>;
      acceptedHistorical: ReadonlyArray<{ workflowId: string; version: string; identity: WorkflowIdentity }>;
      activated: ReadonlyArray<{ workflowId: string; version: string; previousVersion?: string }>;
      backupName: string;
    };

export type WorkflowReleaseCoordinator = {
  reconcile(releaseSet: BuiltinWorkflowReleaseSet): Promise<ReleaseReconcileResult>;
};

type PlannedActivation = {
  workflowId: string;
  version: string;
  contentHash: string;
  previousVersion?: string;
};

type CoordinatorDeps = {
  registry: WorkflowRegistry;
  backup(releaseId: string, manifestHash: string): string;
  now(): number;
  isCompatible(definition: WorkflowDefinition): boolean;
};

async function chooseBuiltinActivations(
  registry: WorkflowRegistry,
  prepared: PreparedReleaseSet,
  effectiveRecords: ReadonlyMap<string, RegistryRecord>,
  isCompatible: CoordinatorDeps['isCompatible'],
): Promise<PlannedActivation[]> {
  const byWorkflow = new Map<string, PreparedBuiltinRelease[]>();
  for (const release of prepared.releases) {
    if (!isCompatible(release.definition)) continue;
    const versions = byWorkflow.get(release.record.workflowId) ?? [];
    versions.push(release);
    byWorkflow.set(release.record.workflowId, versions);
  }

  const activations: PlannedActivation[] = [];
  for (const [workflowId, releases] of byWorkflow) {
    const selected = [...releases].sort((left, right) =>
      compareVersions(right.record.version, left.record.version)
    )[0];
    const target = effectiveRecords.get(`${workflowId}\u0000${selected.record.version}`);
    if (!target) throw new RegistryReleaseError('REGISTRY_RELEASE_TARGET_MISSING');
    const pointer = await registry.getActivePointer(workflowId);
    const active = pointer ? await registry.get(pointer.workflowId, pointer.version) : undefined;
    if (pointer && (!active || active.contentHash !== pointer.contentHash)) {
      throw new RegistryReleaseError('REGISTRY_ACTIVE_POINTER_INVALID');
    }
    if (active && active.source !== 'builtin') continue;
    if (active?.version === target.version && active.contentHash === target.contentHash) continue;
    activations.push({
      workflowId,
      version: target.version,
      contentHash: target.contentHash,
      previousVersion: active?.version,
    });
  }
  return activations;
}

function verifyStoredRecord(record: RegistryRecord): {
  payload: unknown;
  format: ReturnType<typeof detectWorkflowRepresentation>['format'];
} {
  try {
    const payload: unknown = JSON.parse(record.definitionJson);
    const representation = detectWorkflowRepresentation(payload);
    if (representation.scheme !== record.hashScheme) {
      throw new RegistryReleaseError('REGISTRY_STORED_DIGEST_INVALID');
    }
    if (computeWorkflowDigest(payload, record.hashScheme) !== record.contentHash) {
      throw new RegistryReleaseError('REGISTRY_STORED_DIGEST_INVALID');
    }
    return { payload, format: representation.format };
  } catch (cause) {
    if (cause instanceof RegistryReleaseError) throw cause;
    throw new RegistryReleaseError('REGISTRY_STORED_DIGEST_INVALID', { cause });
  }
}

export function createWorkflowReleaseCoordinator(deps: CoordinatorDeps): WorkflowReleaseCoordinator {
  return {
    async reconcile(releaseSet) {
      const prepared = await prepareBuiltinReleaseSet(releaseSet);
      const applied = await deps.registry.getAppliedRelease(prepared.releaseId);
      if (applied?.manifestHash === prepared.manifestHash) return { status: 'unchanged' };
      if (applied) throw new RegistryReleaseError('REGISTRY_RELEASE_ID_REUSED');

      const records: RegistryRecord[] = [];
      const acceptedHistorical: Array<{ workflowId: string; version: string; identity: WorkflowIdentity }> = [];
      const effectiveRecords = new Map<string, RegistryRecord>();
      for (const release of prepared.releases) {
        const coordinate = `${release.record.workflowId}\u0000${release.record.version}`;
        const existing = await deps.registry.get(release.record.workflowId, release.record.version);
        if (!existing) {
          const record = { ...release.record, installedAt: deps.now() };
          records.push(record);
          effectiveRecords.set(coordinate, record);
          continue;
        }

        const stored = verifyStoredRecord(existing);
        if (existing.contentHash === release.record.contentHash && existing.hashScheme === release.record.hashScheme) {
          effectiveRecords.set(coordinate, existing);
          continue;
        }
        const historical = release.acceptedHistorical.find((item) =>
          item.workflowId === existing.workflowId
          && item.version === existing.version
          && item.identity.digest === existing.contentHash
          && item.identity.scheme === existing.hashScheme
          && item.format === stored.format
        );
        if (!historical) throw new RegistryReleaseError('REGISTRY_IMMUTABLE_VERSION_CONFLICT');
        acceptedHistorical.push({
          workflowId: existing.workflowId,
          version: existing.version,
          identity: historical.identity,
        });
        effectiveRecords.set(coordinate, existing);
      }

      const activations = await chooseBuiltinActivations(
        deps.registry,
        prepared,
        effectiveRecords,
        deps.isCompatible,
      );
      let backupName: string;
      try {
        backupName = deps.backup(prepared.releaseId, prepared.manifestHash);
      } catch (cause) {
        throw new RegistryReleaseError('REGISTRY_RELEASE_BACKUP_FAILED', { cause });
      }
      await deps.registry.applyBuiltinRelease({
        releaseId: prepared.releaseId,
        manifestHash: prepared.manifestHash,
        records,
        activations,
        appliedAt: deps.now(),
      });
      return {
        status: 'updated',
        installed: records.map(({ workflowId, version }) => ({ workflowId, version })),
        acceptedHistorical,
        activated: activations.map(({ workflowId, version, previousVersion }) => ({
          workflowId, version, previousVersion,
        })),
        backupName,
      };
    },
  };
}
