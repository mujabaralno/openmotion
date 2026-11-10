import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_DATABASE_PATH = path.join(
  process.cwd(),
  "data",
  "app.db",
);

import { STEP_KINDS } from '../../lib/pipeline-steps.ts';
export { STEP_KINDS, type StepKind } from '../../lib/pipeline-steps.ts';

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

const stepKindList = STEP_KINDS.slice(0, 5).map((kind) => `'${kind}'`).join(", ");
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
  {
    version: 2,
    name: "pipeline-revision-notes",
    up(db) {
      const columns = db.prepare("PRAGMA table_info(steps)").all() as {name: string}[];
      if (!columns.some(column => column.name === "notes")) db.exec("ALTER TABLE steps ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
    },
  },
  {
    version: 3,
    name: 'step-model-and-effort',
    up(db) {
      const columns = db.prepare('PRAGMA table_info(steps)').all() as { name: string }[];
      for (const column of ['model_id', 'effort']) {
        if (!columns.some(existing => existing.name === column)) db.exec(`ALTER TABLE steps ADD COLUMN ${column} TEXT`);
      }
    },
  },
  {
    version: 4,
    name: 'thumbnail-and-publish-steps',
    up(db) {
      const kinds = STEP_KINDS.map(kind => `'${kind}'`).join(', ');
      db.exec(`
        DROP TRIGGER IF EXISTS steps_validate_kind_status_insert;
        DROP TRIGGER IF EXISTS steps_validate_kind_status_update;
        CREATE TRIGGER steps_validate_kind_status_insert BEFORE INSERT ON steps
        FOR EACH ROW WHEN NEW.kind NOT IN (${kinds}) OR NEW.status NOT IN (${stepStatusList})
        BEGIN SELECT RAISE(ABORT, 'invalid step kind or status'); END;
        CREATE TRIGGER steps_validate_kind_status_update BEFORE UPDATE OF kind, status ON steps
        FOR EACH ROW WHEN NEW.kind NOT IN (${kinds}) OR NEW.status NOT IN (${stepStatusList})
        BEGIN SELECT RAISE(ABORT, 'invalid step kind or status'); END;
      `);
      const insert = db.prepare(`INSERT INTO steps (episode_id, kind, status)
        SELECT id, ?, 'idle' FROM episodes WHERE NOT EXISTS (
          SELECT 1 FROM steps WHERE episode_id = episodes.id AND kind = ?
        )`);
      for (const kind of ['thumbnail', 'publish']) insert.run(kind, kind);
    },
  },
  {
    version: 5,
    name: 'research-chat-and-youtube-analytics',
    up(db) {
      db.exec(`
        CREATE TABLE research_threads (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE research_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          thread_id TEXT NOT NULL REFERENCES research_threads(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('user','assistant')),
          content TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL CHECK(status IN ('running','completed','failed','cancelled')),
          sources TEXT NOT NULL DEFAULT '[]', error TEXT, agent_id TEXT, model_id TEXT, effort TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_research_messages_thread ON research_messages(thread_id, id);
        CREATE VIRTUAL TABLE research_knowledge USING fts5(source_id UNINDEXED, title, content, href UNINDEXED, kind UNINDEXED, tokenize='unicode61');
        CREATE TABLE youtube_connection (id INTEGER PRIMARY KEY CHECK(id=1), credentials TEXT NOT NULL, channel_id TEXT, channel_title TEXT, synced_at TEXT, period_start TEXT, period_end TEXT);
        CREATE TABLE youtube_oauth (state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, redirect_uri TEXT NOT NULL, expires_at INTEGER NOT NULL);
        CREATE TABLE youtube_videos (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, published_at TEXT NOT NULL,
          views REAL NOT NULL, watch_minutes REAL NOT NULL, average_percentage REAL NOT NULL,
          likes REAL NOT NULL, comments REAL NOT NULL, subscribers_gained REAL NOT NULL
        );
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
