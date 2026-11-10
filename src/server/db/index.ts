import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_DATABASE_PATH = path.join(
  process.cwd(),
  "data",
  "app.db",
);

const SCHEMA = `
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
`;

export function createDatabase(
  filePath: string = DEFAULT_DATABASE_PATH,
): Database.Database {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  return db;
}

let database: Database.Database | undefined;

export function getDb(): Database.Database {
  database ??= createDatabase();
  return database;
}
