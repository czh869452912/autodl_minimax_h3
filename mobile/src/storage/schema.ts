export const APP_SCHEMA_VERSION = 8;
export const RECOVERY_TABLE = 'app_database_recovery';

export const APP_TABLES = [
  'workflow_artifacts', 'workflow_jobs', 'workflow_operations', 'workflow_job_events',
  'artifact_blob_refs', 'artifact_blobs', 'media_deliveries', 'media_assets', 'tasks',
  'workflow_registry_releases', 'workflow_registry_active', 'workflow_registry', 'prompt_drafts', 'agent_threads',
  'app_scheduler_leases', 'task_projection_state', 'executor_wake_state', RECOVERY_TABLE,
] as const;

export const V5_SCHEMA_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS workflow_jobs (id TEXT PRIMARY KEY NOT NULL, workflow_id TEXT NOT NULL, workflow_version TEXT NOT NULL, workflow_hash TEXT NOT NULL, adapter_id TEXT NOT NULL, adapter_version TEXT NOT NULL, input_json TEXT NOT NULL, output_mapping_json TEXT, remote_json TEXT, status TEXT NOT NULL, error_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, started_at INTEGER, execution_duration REAL)',
  'CREATE TABLE IF NOT EXISTS workflow_artifacts (id TEXT NOT NULL, job_id TEXT NOT NULL, kind TEXT NOT NULL, uri TEXT, mime TEXT, metadata_json TEXT, PRIMARY KEY (job_id, id))',
  "CREATE TABLE IF NOT EXISTS media_assets (id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL, title TEXT NOT NULL, prompt TEXT NOT NULL, source_url TEXT NOT NULL, local_path TEXT, poster_path TEXT, mime_type TEXT NOT NULL, width INTEGER, height INTEGER, duration_ms INTEGER, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, artifact_id TEXT, job_id TEXT, workflow_id TEXT, kind TEXT NOT NULL DEFAULT 'video', export_status TEXT)",
  'CREATE TABLE IF NOT EXISTS media_deliveries (id TEXT PRIMARY KEY NOT NULL, asset_id TEXT NOT NULL, target TEXT NOT NULL, uri TEXT, status TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  "CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL, resolution TEXT NOT NULL, duration INTEGER NOT NULL, seed TEXT, images_json TEXT, audios_json TEXT, video_url TEXT, local_uri TEXT, thumbnail_url TEXT, download_state TEXT NOT NULL DEFAULT 'IDLE', download_error TEXT, download_progress REAL, gallery_uri TEXT, export_state TEXT NOT NULL DEFAULT 'NOT_REQUESTED', export_error TEXT, exported_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, started_at INTEGER, execution_duration INTEGER, workflow_id TEXT, workflow_version TEXT, workflow_hash TEXT, adapter_id TEXT, adapter_version TEXT, input_json TEXT, sync_error TEXT, last_sync_at INTEGER)",
  'CREATE TABLE IF NOT EXISTS workflow_registry (workflow_id TEXT NOT NULL, version TEXT NOT NULL, content_hash TEXT NOT NULL, source TEXT NOT NULL, trust TEXT NOT NULL, definition_json TEXT NOT NULL, installed_at INTEGER NOT NULL, repository TEXT, ref TEXT, commit_sha TEXT, PRIMARY KEY (workflow_id, version))',
  'CREATE TABLE IF NOT EXISTS workflow_registry_active (workflow_id TEXT PRIMARY KEY NOT NULL, version TEXT NOT NULL, content_hash TEXT NOT NULL, previous_version TEXT, previous_hash TEXT)',
  'CREATE TABLE IF NOT EXISTS prompt_drafts (id TEXT PRIMARY KEY NOT NULL, prompt TEXT NOT NULL, attachment_ids_json TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS agent_threads (thread_id TEXT PRIMARY KEY NOT NULL, messages_json TEXT NOT NULL, state_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, custom_title TEXT)',
  'CREATE TABLE IF NOT EXISTS app_scheduler_leases (lease_key TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, expires_at INTEGER NOT NULL)',
  `CREATE TABLE IF NOT EXISTS ${RECOVERY_TABLE} (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), diagnostic TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS idx_workflow_jobs_status_updated_id ON workflow_jobs(status, updated_at ASC, id ASC)',
  'CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets(created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_media_assets_task_kind ON media_assets(task_id, kind)',
  'CREATE INDEX IF NOT EXISTS idx_media_assets_status_created_id ON media_assets(status, created_at DESC, id DESC)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_created_id ON tasks(created_at DESC, id DESC)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_status_updated_id ON tasks(status, updated_at DESC, id DESC)',
] as const;

export const V6_SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS workflow_operations (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, job_id TEXT, idempotency_key TEXT NOT NULL, payload_json TEXT NOT NULL, state TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, next_retry_at INTEGER NOT NULL, lease_owner TEXT, lease_expires_at INTEGER, last_error_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(kind, idempotency_key))",
  'CREATE INDEX IF NOT EXISTS idx_workflow_operations_due ON workflow_operations(kind, state, next_retry_at, lease_expires_at, created_at, id)',
  'CREATE TABLE IF NOT EXISTS workflow_job_events (id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL, sequence INTEGER NOT NULL, event_type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(job_id, sequence))',
  'CREATE INDEX IF NOT EXISTS idx_workflow_job_events_job_sequence ON workflow_job_events(job_id, sequence)',
  'CREATE TABLE IF NOT EXISTS artifact_blobs (sha256 TEXT PRIMARY KEY NOT NULL, byte_size INTEGER NOT NULL, mime TEXT NOT NULL, relative_path TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, verified_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS artifact_blob_refs (blob_sha256 TEXT NOT NULL, owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(blob_sha256, owner_type, owner_id))',
  'CREATE INDEX IF NOT EXISTS idx_artifact_blob_refs_owner ON artifact_blob_refs(owner_type, owner_id)',
] as const;

export const V7_SCHEMA_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS workflow_registry_releases (release_id TEXT PRIMARY KEY NOT NULL, manifest_hash TEXT NOT NULL, applied_at INTEGER NOT NULL)',
] as const;

export const V8_SCHEMA_STATEMENTS = [
  'CREATE INDEX IF NOT EXISTS idx_tasks_activity ON tasks(status, download_state, export_state)',
  'CREATE TABLE IF NOT EXISTS task_projection_state (singleton INTEGER PRIMARY KEY NOT NULL CHECK(singleton = 1), revision INTEGER NOT NULL)',
  'INSERT OR IGNORE INTO task_projection_state(singleton, revision) VALUES (1, 0)',
  'CREATE TABLE IF NOT EXISTS executor_wake_state (singleton INTEGER PRIMARY KEY NOT NULL CHECK(singleton = 1), generation INTEGER NOT NULL, handled_generation INTEGER NOT NULL, maintenance_generation INTEGER NOT NULL, requested_at INTEGER NOT NULL)',
  'INSERT OR IGNORE INTO executor_wake_state(singleton, generation, handled_generation, maintenance_generation, requested_at) VALUES (1, 0, 0, 0, 0)',
  'CREATE TRIGGER IF NOT EXISTS tasks_projection_revision_insert AFTER INSERT ON tasks BEGIN UPDATE task_projection_state SET revision = revision + 1 WHERE singleton = 1; END',
  'CREATE TRIGGER IF NOT EXISTS tasks_projection_revision_update AFTER UPDATE ON tasks BEGIN UPDATE task_projection_state SET revision = revision + 1 WHERE singleton = 1; END',
  'CREATE TRIGGER IF NOT EXISTS tasks_projection_revision_delete AFTER DELETE ON tasks BEGIN UPDATE task_projection_state SET revision = revision + 1 WHERE singleton = 1; END',
  'CREATE TRIGGER IF NOT EXISTS workflow_operations_projection_revision_insert AFTER INSERT ON workflow_operations BEGIN UPDATE task_projection_state SET revision = revision + 1 WHERE singleton = 1; END',
  'CREATE TRIGGER IF NOT EXISTS workflow_operations_projection_revision_update AFTER UPDATE ON workflow_operations BEGIN UPDATE task_projection_state SET revision = revision + 1 WHERE singleton = 1; END',
  'CREATE TRIGGER IF NOT EXISTS workflow_operations_projection_revision_delete AFTER DELETE ON workflow_operations BEGIN UPDATE task_projection_state SET revision = revision + 1 WHERE singleton = 1; END',
  'CREATE INDEX IF NOT EXISTS idx_workflow_operations_expired_claim ON workflow_operations(state, lease_expires_at, id)',
] as const;

export const CURRENT_SCHEMA_STATEMENTS = [...V5_SCHEMA_STATEMENTS, ...V6_SCHEMA_STATEMENTS, ...V7_SCHEMA_STATEMENTS, ...V8_SCHEMA_STATEMENTS] as const;
