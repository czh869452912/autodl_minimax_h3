import type { ArtifactRecord } from './types';

/** Update retained identities in place; remove only outputs absent from the new snapshot. */
export function artifactSnapshotStatements(jobId: string, artifacts: ArtifactRecord[]) {
  const ids = new Set<string>();
  for (const artifact of artifacts) {
    if (artifact.jobId !== jobId) throw new Error('ARTIFACT_JOB_MISMATCH');
    if (ids.has(artifact.id)) throw new Error('DUPLICATE_ARTIFACT_ID');
    ids.add(artifact.id);
  }
  return [
    ...artifacts.map(artifact => ({
      sql: 'INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime,metadata_json) VALUES (?,?,?,?,?,?) ON CONFLICT(job_id,id) DO UPDATE SET kind=excluded.kind,uri=excluded.uri,mime=excluded.mime,metadata_json=excluded.metadata_json',
      params: [artifact.id, jobId, artifact.kind, artifact.uri ?? null, artifact.mime ?? null, artifact.metadata ? JSON.stringify(artifact.metadata) : null],
    })),
    {
      sql: artifacts.length
        ? `DELETE FROM workflow_artifacts WHERE job_id = ? AND id NOT IN (${artifacts.map(() => '?').join(',')})`
        : 'DELETE FROM workflow_artifacts WHERE job_id = ?',
      params: [jobId, ...ids],
    },
  ];
}
