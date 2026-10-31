import {v34PlanControls} from './v34PlanControls';
import {v33ProjectSkills} from './v33ProjectSkills';
import {v32AuthorizationRequests} from './v32AuthorizationRequests';
import { v31SkillDrafts } from './v31SkillDrafts';
import { v30TaskRemoval } from './v30TaskRemoval';
import { v29AgentSkills } from './v29AgentSkills';
import { v16CreativeDomain } from './v16CreativeDomain';
import { v17CreativeDeliveries } from './v17CreativeDeliveries';
import { v18CreativeFiles } from './v18CreativeFiles';
import { v19CreativeAuthorization } from './v19CreativeAuthorization';
import { v20CreativeShots } from './v20CreativeShots';
import { v21CreativeDrafts } from './v21CreativeDrafts';
import { v22CreativeLegacy } from './v22CreativeLegacy';
import { v23CreativeAgent } from './v23CreativeAgent';
import { v24CreativeAssetDetails } from './v24CreativeAssetDetails';
import { v25CreativePlans } from './v25CreativePlans';
import { v26CreativeProjectPresentation } from './v26CreativeProjectPresentation';
import { v28CreativeHistory } from './v28CreativeHistory';
import { v27CreativeReview } from './v27CreativeReview';
import { v15RestoreSafety } from './v15RestoreSafety';
import { v14CreativeCapture } from './v14CreativeCapture';
import type { AppDatabase } from '../appDatabase';
import { APP_SCHEMA_VERSION, APP_TABLES, CURRENT_SCHEMA_STATEMENTS } from '../schema';
import { AppMigrationError, getRecoveryState, markRecovery, migrationDiagnostic } from '../recovery';
import type { MigrationContext, MigrationResult, MigrationStep } from './types';
import { v5Registry } from './v5Registry';
import { v6DurableExecutor } from './v6DurableExecutor';
import { v7RegistryRelease } from './v7RegistryRelease';
import { v8TaskRefresh } from './v8TaskRefresh';
import { v10MediaDeletion } from './v10MediaDeletion';
import { v9AgentRecords } from './v9AgentRecords';
import { v11TaskMonitor } from './v11TaskMonitor';
import { v13TaskArchives } from './v13TaskArchives';
import { v12MonitorFailures } from './v12MonitorFailures';

export type AppDatabaseMigrationOptions = {
  backup?: (db: AppDatabase, fromVersion: number, toVersion: number) => void;
  now?: () => number;
};

const steps = new Map<number, MigrationStep>([
  [v34PlanControls.fromVersion,v34PlanControls],
  [v33ProjectSkills.fromVersion,v33ProjectSkills],
  [v32AuthorizationRequests.fromVersion,v32AuthorizationRequests],
  [v5Registry.fromVersion, v5Registry],
  [v6DurableExecutor.fromVersion, v6DurableExecutor],
  [v7RegistryRelease.fromVersion, v7RegistryRelease],
  [v8TaskRefresh.fromVersion, v8TaskRefresh],
  [v9AgentRecords.fromVersion, v9AgentRecords],
  [v10MediaDeletion.fromVersion, v10MediaDeletion],
  [v11TaskMonitor.fromVersion, v11TaskMonitor],
  [v12MonitorFailures.fromVersion, v12MonitorFailures],
  [v13TaskArchives.fromVersion, v13TaskArchives],
  [v14CreativeCapture.fromVersion, v14CreativeCapture],
  [v15RestoreSafety.fromVersion, v15RestoreSafety],
  [v16CreativeDomain.fromVersion, v16CreativeDomain],
  [v17CreativeDeliveries.fromVersion, v17CreativeDeliveries],
  [v18CreativeFiles.fromVersion, v18CreativeFiles],
  [v19CreativeAuthorization.fromVersion, v19CreativeAuthorization],
  [v20CreativeShots.fromVersion, v20CreativeShots],
  [v21CreativeDrafts.fromVersion, v21CreativeDrafts],
  [v22CreativeLegacy.fromVersion, v22CreativeLegacy],
  [v23CreativeAgent.fromVersion, v23CreativeAgent],
  [v24CreativeAssetDetails.fromVersion, v24CreativeAssetDetails],
  [v25CreativePlans.fromVersion, v25CreativePlans],
  [v26CreativeProjectPresentation.fromVersion, v26CreativeProjectPresentation],
  [v27CreativeReview.fromVersion, v27CreativeReview],
  [v28CreativeHistory.fromVersion, v28CreativeHistory],
  [v29AgentSkills.fromVersion, v29AgentSkills],
  [v30TaskRemoval.fromVersion, v30TaskRemoval],
  [v31SkillDrafts.fromVersion, v31SkillDrafts],
]);

function version(db: AppDatabase): number {
  return Number(db.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0);
}

function hasAppTable(db: AppDatabase): boolean {
  const names = db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
  return names.some((row) => (APP_TABLES as readonly string[]).includes(row.name));
}

function transaction(db: AppDatabase, work: () => void): void {
  if (typeof db.withTransactionSync === 'function') {
    db.withTransactionSync(work);
    return;
  }
  db.execSync('BEGIN');
  try {
    work();
    db.execSync('COMMIT');
  } catch (error) {
    try { db.execSync('ROLLBACK'); } catch { /* best effort */ }
    throw error;
  }
}

function context(db: AppDatabase): MigrationContext {
  return {
    db,
    exec: (sql) => db.execSync(sql),
    hasColumn: (table, column) => db.getAllSync<{ name: string }>(`PRAGMA table_info("${table}")`).some((row) => row.name === column),
  };
}

export function applyCurrentSchema(db: AppDatabase): void {
  for (const statement of CURRENT_SCHEMA_STATEMENTS) db.execSync(statement);
  v6DurableExecutor.apply(context(db));
  v7RegistryRelease.apply(context(db));
  v8TaskRefresh.apply(context(db));
  v9AgentRecords.apply(context(db));
}

export function runAppMigrations(db: AppDatabase, options: AppDatabaseMigrationOptions = {}): MigrationResult {
  const fromVersion = version(db);
  const recovery = getRecoveryState(db);
  if (recovery) throw new AppMigrationError(recovery.diagnostic, fromVersion);
  if (fromVersion === APP_SCHEMA_VERSION) {
    return { mode: 'writable', fromVersion, toVersion: fromVersion, migrated: false };
  }
  if (fromVersion > APP_SCHEMA_VERSION) return { mode: 'future', fromVersion };
  const fresh = fromVersion === 0 && !hasAppTable(db);
  if (!fresh && fromVersion < 4) return { mode: 'legacy', fromVersion };
  const now = options.now ?? Date.now;
  if (!fresh && options.backup) {
    try {
      options.backup(db, fromVersion, APP_SCHEMA_VERSION);
    } catch (cause) {
      const diagnostic = `BACKUP_${fromVersion}_TO_${APP_SCHEMA_VERSION}_FAILED`;
      markRecovery(db, diagnostic, now());
      throw new AppMigrationError(diagnostic, fromVersion, { cause });
    }
  }
  try {
    transaction(db, () => {
      if (fresh) {
        applyCurrentSchema(db);
      } else {
        let current = fromVersion;
        while (current < APP_SCHEMA_VERSION) {
          const step = steps.get(current);
          if (!step) throw new Error(`migration step missing for v${current}`);
          step.apply(context(db));
          current = step.toVersion;
        }
      }
      db.execSync(`PRAGMA user_version = ${APP_SCHEMA_VERSION}`);
    });
  } catch (cause) {
    const diagnostic = migrationDiagnostic(fromVersion, APP_SCHEMA_VERSION);
    markRecovery(db, diagnostic, now());
    throw new AppMigrationError(diagnostic, fromVersion, { cause });
  }
  return { mode: 'writable', fromVersion, toVersion: APP_SCHEMA_VERSION, migrated: true };
}
