import type { AppDatabase } from '../appDatabase';

export type MigrationContext = {
  db: AppDatabase;
  exec(sql: string): void;
  hasColumn(table: string, column: string): boolean;
};

export type MigrationStep = {
  fromVersion: number;
  toVersion: number;
  name: string;
  apply(context: MigrationContext): void;
};

export type MigrationResult =
  | { mode: 'writable'; fromVersion: number; toVersion: number; migrated: boolean }
  | { mode: 'legacy'; fromVersion: number }
  | { mode: 'future'; fromVersion: number };
