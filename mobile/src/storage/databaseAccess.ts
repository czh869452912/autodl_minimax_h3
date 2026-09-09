import type { SQLiteDatabase } from 'expo-sqlite';
import { APP_SCHEMA_VERSION, RECOVERY_TABLE } from './schema';
import { isSqliteBusy } from './sqliteBusy';
import type { AppDatabase } from './appDatabase';

const recoveryQuery = `SELECT diagnostic, created_at FROM ${RECOVERY_TABLE} WHERE id = 1 LIMIT 1`;
const diagnostics = new Set(['PRAGMA user_version', recoveryQuery, "SELECT name FROM sqlite_master WHERE type = 'table'"]);
type AccessOptions = { startupDiagnostic(): string | undefined; didReset?(): void; recoveryDiagnostic?: string };
type Access = { raw: SQLiteDatabase; check(): void; checkAsync(): Promise<void>; options: AccessOptions };
const handles = new WeakMap<AppDatabase, Access>();

function denied(diagnostic: string): never { throw new Error(`APP_DATABASE_READ_ONLY: ${diagnostic}`); }

// Storage-only capability. Never export a raw handle from an application service.
export function maintenanceDatabase(db: AppDatabase): SQLiteDatabase { return handles.get(db)?.raw ?? db as SQLiteDatabase; }
export function didResetDatabase(db: AppDatabase): void {
  const access = handles.get(db);
  if (access) { access.options.recoveryDiagnostic = undefined; access.options.didReset?.(); }
}
export function blockDatabase(db: AppDatabase, diagnostic: string): void {
  const access = handles.get(db);
  if (access) access.options.recoveryDiagnostic = diagnostic;
}
export function checkDatabaseAccess(db: AppDatabase): boolean {
  const access = handles.get(db);
  access?.check();
  return Boolean(access);
}
export async function checkDatabaseAccessAsync(db: AppDatabase): Promise<boolean> {
  const access = handles.get(db);
  await access?.checkAsync();
  return Boolean(access);
}

// In recovery, only exact diagnostic statements are available. We deliberately
// do not infer read-only SQL from getFirst/getAll names or a SQL-prefix regexp.
// Unexposed Expo APIs and nativeDatabase cannot be used to bypass this boundary.
export function protectDatabase(raw: SQLiteDatabase, options: AccessOptions): AppDatabase {
  const validate = (version: { user_version: number } | null, recovery: { diagnostic: string; created_at: number } | null) => {
    const startup = options.recoveryDiagnostic ?? options.startupDiagnostic();
    if (startup) denied(startup);
    if (version?.user_version !== APP_SCHEMA_VERSION) denied('SCHEMA_VERSION_UNSUPPORTED');
    if (recovery) denied(typeof recovery.diagnostic === 'string' ? recovery.diagnostic : 'RECOVERY_STATE_INVALID');
  };
  const check = () => {
    const startup = options.recoveryDiagnostic ?? options.startupDiagnostic();
    if (startup) denied(startup);
    try { validate(raw.getFirstSync('PRAGMA user_version'), raw.getFirstSync(recoveryQuery)); }
    catch (error) {
      if (isSqliteBusy(error)) throw error;
      if (error instanceof Error && error.message.startsWith('APP_DATABASE_READ_ONLY:')) throw error;
      denied('RECOVERY_STATE_UNAVAILABLE');
    }
  };
  const checkAsync = async () => {
    const startup = options.recoveryDiagnostic ?? options.startupDiagnostic();
    if (startup) denied(startup);
    // Preserve SQLITE_BUSY for the existing bounded retry policy.
    const version = await raw.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const recovery = await raw.getFirstAsync<{ diagnostic: string; created_at: number }>(recoveryQuery);
    validate(version, recovery);
  };
  const api: Record<string, unknown> = Object.create(null);
  for (const name of ['runSync', 'execSync', 'getFirstSync', 'getAllSync'] as const) {
    api[name] = (...args: unknown[]) => {
      if (!(name.startsWith('get') && diagnostics.has(String(args[0])))) check();
      return (raw[name] as Function).apply(raw, args);
    };
  }
  for (const name of ['runAsync', 'execAsync', 'getFirstAsync', 'getAllAsync'] as const) {
    api[name] = async (...args: unknown[]) => {
      if (!(name.startsWith('get') && diagnostics.has(String(args[0])))) await checkAsync();
      return (raw[name] as Function).apply(raw, args);
    };
  }
  const protectStatement = (statement: object) => {
    const guarded: Record<string, unknown> = Object.create(null);
    for (const name of ['executeSync', 'executeAsync', 'finalizeSync', 'finalizeAsync']) {
      const method = (statement as Record<string, Function>)[name];
      if (!method) continue;
      guarded[name] = name.endsWith('Async') ? async (...args: unknown[]) => {
        if (name.startsWith('execute')) await checkAsync();
        return method.apply(statement, args);
      } : (...args: unknown[]) => {
        if (name.startsWith('execute')) check();
        return method.apply(statement, args);
      };
    }
    return Object.freeze(guarded);
  };
  api.prepareSync = (sql: string) => { check(); return protectStatement(raw.prepareSync(sql)); };
  api.prepareAsync = async (sql: string) => { await checkAsync(); return protectStatement(await raw.prepareAsync(sql)); };
  if (typeof raw.withTransactionSync === 'function') api.withTransactionSync = (work: () => void) => {
    check();
    return raw.withTransactionSync(() => { work(); check(); });
  };
  if (typeof raw.withTransactionAsync === 'function') api.withTransactionAsync = async (work: () => Promise<void>) => {
    await checkAsync();
    return raw.withTransactionAsync(async () => { await work(); await checkAsync(); });
  };
  api.withExclusiveTransactionAsync = async (work: (tx: AppDatabase) => Promise<void>) => {
    await checkAsync();
    return raw.withExclusiveTransactionAsync(async tx => {
      const guarded = protectDatabase(tx, options);
      await checkDatabaseAccessAsync(guarded);
      await work(guarded);
      await checkDatabaseAccessAsync(guarded);
    });
  };
  const db = new Proxy(Object.freeze(api), {
    get(target, key) {
      if (Reflect.has(target, key)) return Reflect.get(target, key);
      // Native fields never escape; Promise assimilation and inspection stay safe.
      if (typeof key === 'symbol' || key === 'then' || key === 'nativeDatabase') return undefined;
      denied(`UNSUPPORTED_DATABASE_API:${key}`);
    },
  }) as AppDatabase;
  handles.set(db, { raw, check, checkAsync, options });
  return db;
}
