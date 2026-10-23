
export const CREATIVE_DOMAIN_TABLES = ['creative_command_receipts','creative_execution_origins','creative_project_assets','creative_version_files','creative_asset_versions','creative_assets','creative_projects','creative_lineage'] as const;
export const CREATIVE_DOMAIN_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS creative_lineage(id INTEGER PRIMARY KEY CHECK(id=1),namespace TEXT NOT NULL)',
  'INSERT OR IGNORE INTO creative_lineage VALUES(1,lower(hex(randomblob(16))))',
  'CREATE TABLE IF NOT EXISTS creative_projects(id TEXT PRIMARY KEY,title TEXT NOT NULL,brief TEXT NOT NULL,revision INTEGER NOT NULL,archived_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)',
  "CREATE TABLE IF NOT EXISTS creative_assets(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('image','video','audio','prompt','document')),title TEXT NOT NULL,current_version_id TEXT,revision INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS creative_asset_versions(id TEXT PRIMARY KEY,asset_id TEXT NOT NULL REFERENCES creative_assets(id) ON DELETE RESTRICT,version_no INTEGER NOT NULL,source TEXT NOT NULL CHECK(source IN ('import','generated','authored')),recipe_json TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(asset_id,version_no),UNIQUE(asset_id,id))",
  "CREATE TABLE IF NOT EXISTS creative_version_files(version_id TEXT NOT NULL REFERENCES creative_asset_versions(id) ON DELETE RESTRICT,role TEXT NOT NULL CHECK(role IN ('original','preview','thumbnail','sidecar')),blob_sha256 TEXT NOT NULL REFERENCES artifact_blobs(sha256) ON DELETE RESTRICT,state TEXT NOT NULL CHECK(state IN ('AVAILABLE','MISSING','PENDING')),PRIMARY KEY(version_id,role))",
  'CREATE TABLE IF NOT EXISTS creative_project_assets(project_id TEXT NOT NULL REFERENCES creative_projects(id) ON DELETE RESTRICT,asset_id TEXT NOT NULL REFERENCES creative_assets(id) ON DELETE RESTRICT,pinned_version_id TEXT,revision INTEGER NOT NULL,PRIMARY KEY(project_id,asset_id),FOREIGN KEY(asset_id,pinned_version_id) REFERENCES creative_asset_versions(asset_id,id) ON DELETE RESTRICT)',
  "CREATE TABLE IF NOT EXISTS creative_execution_origins(id TEXT PRIMARY KEY,origin_kind TEXT NOT NULL CHECK(origin_kind IN ('user','agent','system')),source_namespace TEXT NOT NULL,thread_id TEXT,run_id TEXT,tool_call_id TEXT,intent_summary TEXT NOT NULL,created_at INTEGER NOT NULL,CHECK(origin_kind!='agent' OR (thread_id IS NOT NULL AND run_id IS NOT NULL)))",
  'CREATE TABLE IF NOT EXISTS creative_command_receipts(id TEXT PRIMARY KEY,idempotency_key TEXT NOT NULL UNIQUE,command_name TEXT NOT NULL,payload_hash TEXT NOT NULL,execution_origin_id TEXT NOT NULL REFERENCES creative_execution_origins(id) ON DELETE RESTRICT,execution_epoch TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS creative_projects_recent ON creative_projects(updated_at DESC,id DESC)',
  'CREATE INDEX IF NOT EXISTS creative_assets_recent ON creative_assets(updated_at DESC,id DESC)',
] as const;
const fields = ['id', 'task_id', 'title', 'prompt', 'source_url', 'local_path', 'poster_path', 'mime_type', 'width', 'height', 'duration_ms', 'status', 'created_at', 'updated_at', 'artifact_id', 'job_id', 'workflow_id', 'kind', 'export_status'] as const;
export const CREATIVE_CAPTURE_TABLES = ['creative_projection_heads', 'creative_legacy_changes', 'creative_migration_state'] as const;
export const CREATIVE_CAPTURE_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS creative_migration_state (id INTEGER PRIMARY KEY CHECK(id=1), phase TEXT NOT NULL CHECK(phase IN ('CAPTURE','BACKFILL','CATCHUP','PRIMARY')), epoch INTEGER NOT NULL DEFAULT 1, backfill_cursor TEXT, replay_sequence INTEGER NOT NULL DEFAULT 0, cutover_sequence INTEGER, writer_ready INTEGER NOT NULL DEFAULT 0 CHECK(writer_ready IN (0,1)))",
  "INSERT OR IGNORE INTO creative_migration_state(id,phase) VALUES(1,'CAPTURE')",
  "CREATE TABLE IF NOT EXISTS creative_legacy_changes(sequence INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('UPSERT','DELETE')), snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)))",
  "CREATE TABLE IF NOT EXISTS creative_projection_heads(projection_kind TEXT NOT NULL,entity_id TEXT NOT NULL,epoch INTEGER NOT NULL,applied_revision INTEGER NOT NULL,tombstoned INTEGER NOT NULL CHECK(tombstoned IN(0,1)),snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),PRIMARY KEY(projection_kind,entity_id))",
  ...(['INSERT', 'UPDATE', 'DELETE'] as const).map(event => {
    const alias = event === 'DELETE' ? 'OLD' : 'NEW';
    return `CREATE TRIGGER IF NOT EXISTS creative_capture_media_${event.toLowerCase()} AFTER ${event} ON media_assets WHEN (SELECT phase FROM creative_migration_state WHERE id=1)!='PRIMARY' BEGIN INSERT INTO creative_legacy_changes(source_id,kind,snapshot_json) VALUES(${alias}.id,'${event === 'DELETE' ? 'DELETE' : 'UPSERT'}',json_object(${fields.map(field => `'${field}',${alias}.${field}`).join(',')})); END`;
  }),
  // Primary activation is intentionally unavailable until every legacy writer is bridged.
  "CREATE TRIGGER IF NOT EXISTS creative_cutover_readiness BEFORE UPDATE OF phase ON creative_migration_state WHEN NEW.phase='PRIMARY' AND OLD.writer_ready!=1 BEGIN SELECT RAISE(ABORT,'CREATIVE_WRITERS_NOT_READY'); END",
] as const;

export const RESTORE_SAFETY_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS creative_execution_state(id INTEGER PRIMARY KEY CHECK(id=1),epoch TEXT NOT NULL)',
  'INSERT OR IGNORE INTO creative_execution_state(id,epoch) VALUES(1,lower(hex(randomblob(16))))',
  'CREATE TABLE IF NOT EXISTS creative_restore_quarantine(entity_kind TEXT NOT NULL,entity_id TEXT NOT NULL,restore_epoch TEXT NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(entity_kind,entity_id))',
  `CREATE TRIGGER IF NOT EXISTS creative_restore_operation_insert AFTER INSERT ON workflow_operations
    WHEN EXISTS(SELECT 1 FROM creative_restore_quarantine WHERE (entity_kind='job' AND entity_id=NEW.job_id) OR (entity_kind='operation' AND entity_id=NEW.id))
    BEGIN UPDATE workflow_operations SET state='BLOCKED',lease_owner=NULL,lease_expires_at=NULL,last_error_json='{"code":"RESTORED_EXECUTION_REQUIRES_REVIEW","message":"恢复的任务需要重新确认，未自动执行"}' WHERE id=NEW.id; END`,
  `CREATE TRIGGER IF NOT EXISTS creative_restore_operation_update BEFORE UPDATE OF state ON workflow_operations
    WHEN NEW.state IN ('PENDING','CLAIMED') AND EXISTS(SELECT 1 FROM creative_restore_quarantine WHERE (entity_kind='job' AND entity_id=NEW.job_id) OR (entity_kind='operation' AND entity_id=NEW.id))
    BEGIN SELECT RAISE(ABORT,'RESTORED_EXECUTION_REQUIRES_REVIEW'); END`,
] as const;
export const CREATIVE_DELIVERY_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS creative_deliveries(id TEXT PRIMARY KEY,version_id TEXT NOT NULL REFERENCES creative_asset_versions(id) ON DELETE RESTRICT,file_role TEXT NOT NULL,target TEXT NOT NULL,generation INTEGER NOT NULL CHECK(generation>0),status TEXT NOT NULL CHECK(status IN ('QUEUED','PUBLISHING','EXPORTED','FAILED','DELIVERY_UNKNOWN','QUARANTINED')),operation_id TEXT NOT NULL UNIQUE REFERENCES workflow_operations(id) ON DELETE RESTRICT,publication_key TEXT NOT NULL UNIQUE,execution_epoch TEXT NOT NULL,destination_uri TEXT,error_code TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(version_id,file_role,target,generation))",
] as const;
export const CREATIVE_FILE_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS creative_file_resources(id TEXT PRIMARY KEY,version_id TEXT NOT NULL REFERENCES creative_asset_versions(id) ON DELETE RESTRICT,role TEXT NOT NULL,expected_sha256 TEXT,blob_sha256 TEXT REFERENCES artifact_blobs(sha256) ON DELETE RESTRICT,state TEXT NOT NULL CHECK(state IN ('PENDING','IMPORTING','AVAILABLE','MISSING','RESTORING','FAILED','EXTERNAL_ONLY')),last_verified_at INTEGER,error_code TEXT,revision INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(version_id,role),CHECK(state!='AVAILABLE' OR (blob_sha256 IS NOT NULL AND expected_sha256 IS NOT NULL AND expected_sha256=blob_sha256)))",
  "CREATE TABLE IF NOT EXISTS creative_recovery_sources(id TEXT PRIMARY KEY,resource_id TEXT NOT NULL REFERENCES creative_file_resources(id) ON DELETE RESTRICT,kind TEXT NOT NULL CHECK(kind IN ('provider_artifact','import_uri','backup')),locator_json TEXT NOT NULL CHECK(json_valid(locator_json)),persisted_permission INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS creative_file_attempts(id TEXT PRIMARY KEY,resource_id TEXT NOT NULL REFERENCES creative_file_resources(id) ON DELETE RESTRICT,state TEXT NOT NULL CHECK(state IN ('RESTORING','SUCCEEDED','FAILED')),started_at INTEGER NOT NULL,completed_at INTEGER,error_code TEXT)",
  "INSERT OR IGNORE INTO creative_file_resources(id,version_id,role,expected_sha256,blob_sha256,state,last_verified_at,created_at,updated_at) SELECT f.version_id||':'||f.role,f.version_id,f.role,f.blob_sha256,f.blob_sha256,f.state,b.verified_at,b.created_at,b.verified_at FROM creative_version_files f JOIN artifact_blobs b ON b.sha256=f.blob_sha256",
  "CREATE TRIGGER IF NOT EXISTS creative_resource_for_file AFTER INSERT ON creative_version_files BEGIN INSERT INTO creative_file_resources(id,version_id,role,expected_sha256,blob_sha256,state,last_verified_at,created_at,updated_at) SELECT NEW.version_id||':'||NEW.role,NEW.version_id,NEW.role,NEW.blob_sha256,NEW.blob_sha256,NEW.state,b.verified_at,b.created_at,b.verified_at FROM artifact_blobs b WHERE b.sha256=NEW.blob_sha256; END",
  "CREATE TRIGGER IF NOT EXISTS creative_resource_hash_immutable BEFORE UPDATE OF expected_sha256 ON creative_file_resources WHEN OLD.expected_sha256 IS NOT NULL AND NEW.expected_sha256 IS NOT OLD.expected_sha256 BEGIN SELECT RAISE(ABORT,'RESOURCE_HASH_IMMUTABLE'); END",
  "CREATE TRIGGER IF NOT EXISTS creative_resource_available BEFORE UPDATE ON creative_file_resources WHEN NEW.state='AVAILABLE' AND NOT EXISTS(SELECT 1 FROM creative_version_files f WHERE f.version_id=NEW.version_id AND f.role=NEW.role AND f.blob_sha256=NEW.blob_sha256) BEGIN SELECT RAISE(ABORT,'RESOURCE_ATTACHMENT_REQUIRED'); END",
  "CREATE TRIGGER IF NOT EXISTS creative_file_state_projection AFTER UPDATE OF state ON creative_file_resources BEGIN UPDATE creative_version_files SET state=CASE WHEN NEW.state='AVAILABLE' THEN 'AVAILABLE' ELSE 'MISSING' END WHERE version_id=NEW.version_id AND role=NEW.role; END",
] as const;
export const CREATIVE_AUTHORIZATION_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS creative_account_bindings(id TEXT PRIMARY KEY,provider_id TEXT NOT NULL,principal_namespace TEXT NOT NULL,verified_principal_id TEXT,identity_mode TEXT NOT NULL CHECK(identity_mode IN ('provider_verified','credential_bound')),verified_at INTEGER NOT NULL,created_at INTEGER NOT NULL,CHECK(identity_mode!='provider_verified' OR verified_principal_id IS NOT NULL))",
  "CREATE TABLE IF NOT EXISTS creative_credential_generations(id TEXT PRIMARY KEY,account_binding_id TEXT NOT NULL REFERENCES creative_account_bindings(id) ON DELETE RESTRICT,secure_store_key TEXT NOT NULL UNIQUE,token_digest TEXT NOT NULL,generation_no INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('active','retired','revoked')),created_at INTEGER NOT NULL,verified_at INTEGER NOT NULL,UNIQUE(account_binding_id,generation_no),UNIQUE(account_binding_id,id))",
  "CREATE TABLE IF NOT EXISTS creative_default_accounts(provider_id TEXT PRIMARY KEY,account_binding_id TEXT NOT NULL,credential_generation_id TEXT NOT NULL,FOREIGN KEY(account_binding_id,credential_generation_id) REFERENCES creative_credential_generations(account_binding_id,id) ON DELETE RESTRICT)",
  "CREATE TABLE IF NOT EXISTS creative_authorizations(id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,project_id TEXT REFERENCES creative_projects(id) ON DELETE RESTRICT,provider_id TEXT NOT NULL,account_binding_id TEXT NOT NULL,credential_generation_id TEXT NOT NULL,execution_epoch TEXT NOT NULL,allowed_operations_json TEXT NOT NULL,request_limit INTEGER NOT NULL CHECK(request_limit>0),amount_limit INTEGER CHECK(amount_limit>=0),unit TEXT NOT NULL,allow_unknown_cost INTEGER NOT NULL CHECK(allow_unknown_cost IN (0,1)),max_unknown_requests INTEGER NOT NULL CHECK(max_unknown_requests>=0),expires_at INTEGER NOT NULL,revoked_at INTEGER,created_at INTEGER NOT NULL,FOREIGN KEY(account_binding_id,credential_generation_id) REFERENCES creative_credential_generations(account_binding_id,id) ON DELETE RESTRICT)",
  "CREATE TABLE IF NOT EXISTS creative_budget_reservations(id TEXT PRIMARY KEY,authorization_id TEXT NOT NULL REFERENCES creative_authorizations(id) ON DELETE RESTRICT,authorization_revision INTEGER NOT NULL,account_binding_id TEXT NOT NULL,credential_generation_id TEXT NOT NULL,execution_epoch TEXT NOT NULL,command_id TEXT NOT NULL UNIQUE,job_id TEXT UNIQUE,request_hash TEXT NOT NULL,operation TEXT NOT NULL,project_id TEXT,request_units INTEGER NOT NULL CHECK(request_units>0),estimate_valid_until INTEGER NOT NULL,reserved_amount INTEGER CHECK(reserved_amount>=0),unit TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('RESERVED','DISPATCHED','SETTLED','UNKNOWN_HELD','RELEASED')),actual_amount INTEGER CHECK(actual_amount>=0),evidence_json TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,FOREIGN KEY(account_binding_id,credential_generation_id) REFERENCES creative_credential_generations(account_binding_id,id) ON DELETE RESTRICT)",
  "CREATE TABLE IF NOT EXISTS creative_budget_events(id TEXT PRIMARY KEY,reservation_id TEXT NOT NULL REFERENCES creative_budget_reservations(id) ON DELETE RESTRICT,transition_key TEXT NOT NULL UNIQUE,from_state TEXT,to_state TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL)",
  "CREATE TRIGGER IF NOT EXISTS creative_budget_events_immutable_update BEFORE UPDATE ON creative_budget_events BEGIN SELECT RAISE(ABORT,'BUDGET_EVENTS_APPEND_ONLY'); END",
  "CREATE TRIGGER IF NOT EXISTS creative_budget_events_immutable_delete BEFORE DELETE ON creative_budget_events BEGIN SELECT RAISE(ABORT,'BUDGET_EVENTS_APPEND_ONLY'); END",
  "CREATE TRIGGER IF NOT EXISTS creative_account_identity_immutable BEFORE UPDATE ON creative_account_bindings BEGIN SELECT RAISE(ABORT,'ACCOUNT_IDENTITY_IMMUTABLE'); END",
  "CREATE TRIGGER IF NOT EXISTS creative_credential_identity_immutable BEFORE UPDATE OF account_binding_id,secure_store_key,token_digest,generation_no ON creative_credential_generations BEGIN SELECT RAISE(ABORT,'CREDENTIAL_IDENTITY_IMMUTABLE'); END",
  'CREATE INDEX IF NOT EXISTS creative_budget_by_authorization ON creative_budget_reservations(authorization_id,state)',
] as const;
export const CREATIVE_SHOT_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS creative_shots(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES creative_projects(id) ON DELETE RESTRICT,title TEXT NOT NULL,description TEXT NOT NULL,sort_key INTEGER NOT NULL,editorial_status TEXT NOT NULL CHECK(editorial_status IN ('planned','working','review','approved')),revision INTEGER NOT NULL DEFAULT 0,deleted_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS creative_shot_assets(shot_id TEXT NOT NULL REFERENCES creative_shots(id) ON DELETE RESTRICT,slot TEXT NOT NULL CHECK(slot IN ('reference_image','reference_audio','selected_image','selected_video')),ordinal INTEGER NOT NULL,version_id TEXT NOT NULL REFERENCES creative_asset_versions(id) ON DELETE RESTRICT,PRIMARY KEY(shot_id,slot,ordinal),CHECK(ordinal>=0 AND (slot NOT IN ('selected_image','selected_video') OR ordinal=0)))",
  'CREATE INDEX IF NOT EXISTS creative_shots_order ON creative_shots(project_id,sort_key,id)',
] as const;
export const CREATIVE_DRAFT_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS creative_generation_drafts(id TEXT PRIMARY KEY,project_id TEXT REFERENCES creative_projects(id) ON DELETE RESTRICT,shot_id TEXT REFERENCES creative_shots(id) ON DELETE RESTRICT,target_asset_id TEXT REFERENCES creative_assets(id) ON DELETE RESTRICT,provider_id TEXT NOT NULL,workflow_id TEXT NOT NULL,input_json TEXT NOT NULL CHECK(json_valid(input_json)),revision INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL CHECK(state IN ('EDITING','SUBMITTED','DISCARDED')),job_id TEXT REFERENCES workflow_jobs(id) ON DELETE RESTRICT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS creative_draft_inputs(draft_id TEXT NOT NULL REFERENCES creative_generation_drafts(id) ON DELETE RESTRICT,slot TEXT NOT NULL,ordinal INTEGER NOT NULL,version_id TEXT NOT NULL REFERENCES creative_asset_versions(id) ON DELETE RESTRICT,PRIMARY KEY(draft_id,slot,ordinal))",
  "CREATE TABLE IF NOT EXISTS creative_job_contexts(job_id TEXT PRIMARY KEY REFERENCES workflow_jobs(id) ON DELETE RESTRICT,draft_id TEXT REFERENCES creative_generation_drafts(id) ON DELETE RESTRICT,draft_revision INTEGER NOT NULL,project_id TEXT REFERENCES creative_projects(id) ON DELETE RESTRICT,shot_id TEXT REFERENCES creative_shots(id) ON DELETE RESTRICT,target_asset_id TEXT NOT NULL REFERENCES creative_assets(id) ON DELETE RESTRICT,input_snapshot_json TEXT NOT NULL,request_hash TEXT NOT NULL,reservation_id TEXT REFERENCES creative_budget_reservations(id) ON DELETE RESTRICT,execution_epoch TEXT NOT NULL,created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS creative_job_inputs(job_id TEXT NOT NULL REFERENCES workflow_jobs(id) ON DELETE RESTRICT,slot TEXT NOT NULL,ordinal INTEGER NOT NULL,version_id TEXT NOT NULL REFERENCES creative_asset_versions(id) ON DELETE RESTRICT,PRIMARY KEY(job_id,slot,ordinal))",
  "CREATE TABLE IF NOT EXISTS creative_output_links(job_id TEXT NOT NULL REFERENCES workflow_jobs(id) ON DELETE RESTRICT,artifact_id TEXT NOT NULL,version_id TEXT NOT NULL UNIQUE REFERENCES creative_asset_versions(id) ON DELETE RESTRICT,PRIMARY KEY(job_id,artifact_id))",
  "CREATE TRIGGER IF NOT EXISTS creative_job_context_immutable BEFORE UPDATE ON creative_job_contexts BEGIN SELECT RAISE(ABORT,'JOB_CONTEXT_IMMUTABLE'); END",
  'CREATE INDEX IF NOT EXISTS creative_drafts_recent ON creative_generation_drafts(project_id,updated_at DESC)',
] as const;
export const APP_SCHEMA_VERSION = 21;
export const RECOVERY_TABLE = 'app_database_recovery';

export const APP_TABLES = [
  'creative_output_links','creative_job_inputs','creative_job_contexts','creative_draft_inputs','creative_generation_drafts',
  'creative_shot_assets','creative_shots',
  'creative_budget_events','creative_budget_reservations','creative_authorizations','creative_default_accounts','creative_credential_generations','creative_account_bindings',
  'creative_file_attempts', 'creative_recovery_sources', 'creative_file_resources', 'creative_deliveries',
  ...CREATIVE_DOMAIN_TABLES,
  ...CREATIVE_CAPTURE_TABLES,
  'creative_restore_quarantine', 'creative_execution_state',
  'task_archives', 'task_monitor_events',
  'media_asset_tombstones', 'workflow_artifacts', 'workflow_jobs', 'workflow_operations', 'workflow_job_events',
  'artifact_blob_refs', 'artifact_blobs', 'media_deliveries', 'media_assets', 'tasks',
  'workflow_registry_releases', 'workflow_registry_active', 'workflow_registry', 'prompt_drafts', 'agent_threads',
  'app_scheduler_leases', 'task_projection_state', 'executor_wake_state', RECOVERY_TABLE,
  'agent_messages', 'agent_runs', 'agent_versions', 'agent_client_records', 'agent_thread_index',
  'agent_handoffs', 'agent_submissions', 'agent_workspaces',
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

export const V9_SCHEMA_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS agent_submissions (id TEXT PRIMARY KEY NOT NULL,thread_id TEXT NOT NULL,user_message_id TEXT NOT NULL,run_id TEXT NOT NULL,draft_revision INTEGER NOT NULL)',
  "CREATE TABLE IF NOT EXISTS agent_thread_index (thread_id TEXT PRIMARY KEY NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, custom_title TEXT, title TEXT NOT NULL DEFAULT '', message_count INTEGER NOT NULL DEFAULT 0, last_run_json TEXT, read_at INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0)",
  'CREATE INDEX IF NOT EXISTS idx_agent_threads_page ON agent_thread_index(deleted,updated_at DESC,thread_id)',
  'CREATE TABLE IF NOT EXISTS agent_messages (thread_id TEXT NOT NULL,id TEXT NOT NULL,sequence INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(thread_id,id),UNIQUE(thread_id,sequence))',
  'CREATE TABLE IF NOT EXISTS agent_runs (thread_id TEXT NOT NULL,id TEXT NOT NULL,sequence INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(thread_id,id),UNIQUE(thread_id,sequence))',
  'CREATE TABLE IF NOT EXISTS agent_versions (thread_id TEXT NOT NULL,id TEXT NOT NULL,sequence INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(thread_id,id),UNIQUE(thread_id,sequence))',
  'CREATE TABLE IF NOT EXISTS agent_workspaces (thread_id TEXT NOT NULL,id TEXT NOT NULL,sequence INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(thread_id,id),UNIQUE(thread_id,sequence))',
  'CREATE TABLE IF NOT EXISTS agent_client_records (thread_id TEXT NOT NULL,id TEXT NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(thread_id,id))',
  'CREATE TABLE IF NOT EXISTS agent_handoffs (id TEXT PRIMARY KEY NOT NULL,payload_json TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL)',
] as const;

export const V10_SCHEMA_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS media_asset_tombstones (id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL, artifact_id TEXT, kind TEXT NOT NULL, deleted_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_media_tombstones_task ON media_asset_tombstones(task_id,artifact_id)',
  "CREATE TRIGGER IF NOT EXISTS media_assets_respect_deletion BEFORE INSERT ON media_assets WHEN EXISTS (SELECT 1 FROM media_asset_tombstones d WHERE d.id=NEW.id OR (d.task_id=NEW.task_id AND d.artifact_id=NEW.artifact_id) OR (d.task_id=NEW.task_id AND d.kind=NEW.kind AND NEW.artifact_id='recovered-primary-video')) BEGIN SELECT RAISE(IGNORE); END",
  "CREATE TRIGGER IF NOT EXISTS media_refs_respect_deletion BEFORE INSERT ON artifact_blob_refs WHEN NEW.owner_type IN ('workflow_artifact','workflow_artifact_original') AND EXISTS (SELECT 1 FROM media_asset_tombstones d WHERE NEW.owner_id=d.task_id || ':' || d.artifact_id) BEGIN SELECT RAISE(IGNORE); END",
  "CREATE TRIGGER IF NOT EXISTS media_deliveries_respect_deletion BEFORE INSERT ON media_deliveries WHEN EXISTS(SELECT 1 FROM media_asset_tombstones WHERE id=NEW.asset_id) BEGIN SELECT RAISE(IGNORE); END",
] as const;

export const V11_SCHEMA_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS task_monitor_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE)',
  "CREATE TRIGGER IF NOT EXISTS task_monitor_event_insert AFTER INSERT ON workflow_job_events WHEN NEW.event_type IN ('STATUS_RECONCILED','cancelled') BEGIN INSERT INTO task_monitor_events(event_id) VALUES(NEW.id); END",
  'CREATE TRIGGER IF NOT EXISTS task_monitor_event_delete AFTER DELETE ON workflow_job_events BEGIN DELETE FROM task_monitor_events WHERE event_id=OLD.id; END',
] as const;

export const V12_SCHEMA_STATEMENTS = [
  'DROP TRIGGER IF EXISTS task_monitor_event_insert',
  "CREATE TRIGGER task_monitor_event_insert AFTER INSERT ON workflow_job_events WHEN NEW.event_type IN ('STATUS_RECONCILED','cancelled','SUBMIT_FAILED','STATUS_SYNC_FAILED') BEGIN INSERT INTO task_monitor_events(event_id) VALUES(NEW.id); END",
] as const;

export const V13_SCHEMA_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS task_archives (task_id TEXT PRIMARY KEY NOT NULL, archived_at INTEGER NOT NULL)',
  'CREATE TRIGGER IF NOT EXISTS archive_revision_insert AFTER INSERT ON task_archives BEGIN UPDATE task_projection_state SET revision=revision+1 WHERE singleton=1; END',
  'CREATE TRIGGER IF NOT EXISTS archive_revision_delete AFTER DELETE ON task_archives BEGIN UPDATE task_projection_state SET revision=revision+1 WHERE singleton=1; END',
  'CREATE TRIGGER IF NOT EXISTS archive_task_delete AFTER DELETE ON tasks BEGIN DELETE FROM task_archives WHERE task_id=OLD.id; END',
] as const;

export const CURRENT_SCHEMA_STATEMENTS = [...V5_SCHEMA_STATEMENTS, ...V6_SCHEMA_STATEMENTS, ...V7_SCHEMA_STATEMENTS, ...V8_SCHEMA_STATEMENTS, ...V9_SCHEMA_STATEMENTS, ...V10_SCHEMA_STATEMENTS, ...V11_SCHEMA_STATEMENTS, ...V12_SCHEMA_STATEMENTS, ...V13_SCHEMA_STATEMENTS, ...CREATIVE_CAPTURE_SCHEMA, ...RESTORE_SAFETY_SCHEMA, ...CREATIVE_DOMAIN_SCHEMA, ...CREATIVE_DELIVERY_SCHEMA, ...CREATIVE_FILE_SCHEMA, ...CREATIVE_AUTHORIZATION_SCHEMA, ...CREATIVE_SHOT_SCHEMA, ...CREATIVE_DRAFT_SCHEMA] as const;
