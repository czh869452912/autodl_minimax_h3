import type { AppDatabase } from '../storage/appDatabase';
import type { JobStateRepository } from './jobStateStore';
import type { OperationRepository } from '../workflows/executor/operationRepository';
import type { WorkflowOperation } from '../workflows/executor/types';
import type { ApplicationProviderRegistry } from '../providers/applicationRegistry';
import type { ProviderAdapter } from '../workflows/providers/registry';
import { createDurableExecutor } from '../workflows/executor/durableExecutor';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { bindCreativeAdapter, readCreativeJobBinding } from '../creative/boundExecution';
import { createCreativeBudget } from '../creative/budget';
import { JobBindingError, readJobExecutionBinding, resolveBoundJobCredential, type JobExecutionBinding } from './credentialBinding';
import type { ExactCredentialResolver, ResolvedCredential } from '../providers/credentials';

type Deps = {
  db: AppDatabase;
  jobs: JobStateRepository;
  operations: OperationRepository;
  providers: ApplicationProviderRegistry;
  resolveExact: ExactCredentialResolver;
  resolveLegacyDefault: () => Promise<ResolvedCredential | null>;
  now?: () => number;
};

/** One dispatch/poll path for manual, Agent and compatibility-entry jobs. */
export function createProviderExecution(deps: Deps) {
  const { db, jobs, operations, providers } = deps, now = deps.now ?? Date.now;
  const durable = (adapters: Map<string, ProviderAdapter>) => createDurableExecutor({ jobs, operations, adapters, runtime: createWorkflowRuntime({ adapters }), credentials: { get: async () => ({ ok: true }) }, now });
  // Recovery only reconciles persisted facts; it never needs to resolve a default secret.
  const recovery = durable(new Map());
  return {
    recover: (timestamp: number) => recovery.recover(timestamp),
    async handle(operation: WorkflowOperation, owner: string) {
      if (operation.kind !== 'SUBMIT' && operation.kind !== 'STATUS_SYNC') throw new Error('PROVIDER_OPERATION_UNSUPPORTED');
      const job = operation.jobId ? await jobs.get(operation.jobId) : null;
      if (!job) return recovery.handle(operation, owner);
      let binding: JobExecutionBinding | undefined, adapter: ProviderAdapter;
      try {
        binding = await readJobExecutionBinding(db, job.id);
        const registration = providers.registration(job.adapterId);
        const identity = binding.kind !== 'legacy' && operation.kind === 'STATUS_SYNC' && registration.statusSource === 'local-receipt'
          ? { ...binding.credential, token: '' }
          : await resolveBoundJobCredential(binding, operation.kind === 'SUBMIT' ? 'dispatch' : 'query', deps.resolveExact)
          ?? await deps.resolveLegacyDefault();
        if (!identity) throw new Error('TASK_CREDENTIAL_UNAVAILABLE');
        adapter = providers.adapter(job.adapterId, identity, job.id);
        if (binding.kind === 'creative') adapter = bindCreativeAdapter(db, adapter, binding.reservation, identity, operation, owner, now);
      } catch (cause) {
        // Storage failures belong to runner recovery, not permanent credential failure.
        if (!binding && !(cause instanceof JobBindingError)) throw cause;
        const unavailable = cause instanceof Error && cause.message.startsWith('PROVIDER_ADAPTER_');
        const error = {
          code: unavailable ? 'ADAPTER_UNAVAILABLE' : binding?.kind === 'creative' ? 'CREATIVE_CREDENTIAL_UNAVAILABLE' : 'TASK_CREDENTIAL_UNAVAILABLE',
          message: unavailable ? '当前版本不支持此任务来源，请更新应用。' : '本次任务使用的凭据或绑定不可用，请在创作账号中检查连接。',
          retryable: false,
        };
        const unsent = operation.kind === 'SUBMIT' && job.status === 'READY_TO_SUBMIT' && !job.providerHandle;
        if (unsent) {
          const result = await jobs.transition({ jobId: job.id, expectedRevision: job.revision, patch: { status: 'FAILED', lastError: error, updatedAt: now() }, event: { id: operation.id + ':credential-unavailable', type: 'SUBMISSION_FAILED', payload: { code: error.code }, createdAt: now() } });
          if (result.ok && binding?.kind === 'creative' && binding.reservation.state === 'RESERVED') await createCreativeBudget(db).transition(binding.reservation.id, { key: 'release:' + binding.reservation.id, to: 'RELEASED', evidence: '本地凭据或适配器检查失败，未发送请求。' });
        }
        await operations.finish(operation.id, owner, unsent ? 'FAILED' : 'BLOCKED', now(), error);
        return;
      }
      await durable(new Map([[job.adapterId, adapter]])).handle(operation, owner);
      if (binding.kind !== 'creative') return;
      const current = await jobs.get(job.id);
      if (!current || !['UNKNOWN', 'FAILED', 'SUCCEEDED', 'PARTIAL_SUCCEEDED', 'CANCELLED'].includes(current.status)) return;
      const reservation = await readCreativeJobBinding(db, job.id);
      if (reservation?.state === 'RESERVED' && ['FAILED', 'CANCELLED'].includes(current.status)) await createCreativeBudget(db).transition(reservation.id, { key: 'release:' + reservation.id, to: 'RELEASED', evidence: '本地准备失败或取消，未发送请求。' });
      if (reservation?.state === 'DISPATCHED') await createCreativeBudget(db).transition(reservation.id, { key: `outcome:${reservation.id}`, to: 'UNKNOWN_HELD', evidence: '服务商未返回可核验费用；保留本次消费占用。' });
    },
  };
}
