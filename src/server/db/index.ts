import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_DATABASE_PATH = path.join(
  process.cwd(),
  "data",
  "app.db",
);

export const STEP_KINDS = [
  "script",
  "tags",
  "voiceover",
  "scenes",
  "render",
] as const;

export type StepKind = (typeof STEP_KINDS)[number];

export const STEP_STATUSES = [
  "idle",
  "running",
  "review",
  "approved",
  "failed",
] as const;

export type StepStatus = (typeof STEP_STATUSES)[number];

type Migration = {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
};

const stepKindList = STEP_KINDS.map((kind) => `'${kind}'`).join(", ");
const stepStatusList = STEP_STATUSES.map((status) => `'${status}'`).join(", ");

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "initial-schema",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS episodes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          topic TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS steps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'idle',
          agent_id TEXT,
          session_ref TEXT,
          started_at TEXT,
          finished_at TEXT,
          error TEXT
        );

        CREATE TABLE IF NOT EXISTS permission_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          step_id INTEGER NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
          request_summary TEXT NOT NULL,
          decision TEXT NOT NULL,
          decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS render_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'queued',
          progress REAL NOT NULL DEFAULT 0,
          output_path TEXT,
          started_at TEXT,
          finished_at TEXT,
          error TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_steps_episode_id
          ON steps(episode_id);

        CREATE INDEX IF NOT EXISTS idx_permission_log_step_id
          ON permission_log(step_id);

        CREATE INDEX IF NOT EXISTS idx_render_jobs_episode_id
          ON render_jobs(episode_id);

        CREATE TRIGGER IF NOT EXISTS steps_validate_kind_status_insert
        BEFORE INSERT ON steps
        FOR EACH ROW
        WHEN NEW.kind NOT IN (${stepKindList})
          OR NEW.status NOT IN (${stepStatusList})
        BEGIN
          SELECT RAISE(ABORT, 'invalid step kind or status');
        END;

        CREATE TRIGGER IF NOT EXISTS steps_validate_kind_status_update
        BEFORE UPDATE OF kind, status ON steps
        FOR EACH ROW
        WHEN NEW.kind NOT IN (${stepKindList})
          OR NEW.status NOT IN (${stepStatusList})
        BEGIN
          SELECT RAISE(ABORT, 'invalid step kind or status');
        END;
      `);
    },
  },
];

function createMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function applyMigrations(db: Database.Database): void {
  createMigrationsTable(db);

  const appliedVersions = new Set(
    db
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => Number((row as { version: number }).version)),
  );
  const recordMigration = db.prepare(
    "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
  );

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;

    const apply = db.transaction(() => {
      migration.up(db);
      recordMigration.run(migration.version, migration.name);
    });

    apply();
  }
}

export function createDatabase(
  filePath: string = DEFAULT_DATABASE_PATH,
): Database.Database {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);

  return db;
}

let database: Database.Database | undefined;

export function getDb(): Database.Database {
  database ??= createDatabase();
  return database;
}
