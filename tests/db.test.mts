import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  createDatabase,
  STEP_KINDS,
  STEP_STATUSES,
} from "../src/server/db/index.ts";

const EXPECTED_MIGRATIONS = [
  { version: 1, name: "initial-schema" },
  { version: 2, name: "pipeline-revision-notes" },
  { version: 3, name: "step-model-and-effort" },
];

const LEGACY_SCHEMA = `
  CREATE TABLE episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE steps (
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

  CREATE TABLE permission_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step_id INTEGER NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
    request_summary TEXT NOT NULL,
    decision TEXT NOT NULL,
    decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE render_jobs (
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

function withTempDirectory(run: (directory: string) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-db-"));

  try {
    run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function tableColumns(db: Database.Database, table: string): string[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((column) => (column as { name: string }).name);
}

function namesOf(db: Database.Database, type: string): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name")
    .all(type)
    .map((row) => (row as { name: string }).name);
}

function insertEpisode(
  db: Database.Database,
  slug = "episode-uji",
): number {
  const result = db
    .prepare("INSERT INTO episodes (slug, title, topic) VALUES (?, ?, ?)")
    .run(slug, "Episode Uji", "Topik Uji");

  return Number(result.lastInsertRowid);
}

test("membuat database, tabel, indeks, trigger, dan migrasi otomatis", () => {
  withTempDirectory((directory) => {
    const databasePath = path.join(directory, "data", "app.db");
    const db = createDatabase(databasePath);

    try {
      assert.equal(fs.existsSync(databasePath), true);
      assert.equal(fs.statSync(path.dirname(databasePath)).isDirectory(), true);

      const tables = namesOf(db, "table").filter(
        (name) => !name.startsWith("sqlite_"),
      );

      assert.deepEqual(tables, [
        "episodes",
        "permission_log",
        "render_jobs",
        "schema_migrations",
        "steps",
      ]);

      assert.deepEqual(tableColumns(db, "episodes"), [
        "id",
        "slug",
        "title",
        "topic",
        "created_at",
        "updated_at",
      ]);
      assert.deepEqual(tableColumns(db, "steps"), [
        "id",
        "episode_id",
        "kind",
        "status",
        "agent_id",
        "session_ref",
        "started_at",
        "finished_at",
        "error",
        "notes",
        "model_id",
        "effort",
      ]);
      assert.deepEqual(tableColumns(db, "permission_log"), [
        "id",
        "step_id",
        "request_summary",
        "decision",
        "decided_at",
      ]);
      assert.deepEqual(tableColumns(db, "render_jobs"), [
        "id",
        "episode_id",
        "status",
        "progress",
        "output_path",
        "started_at",
        "finished_at",
        "error",
      ]);

      const indexes = namesOf(db, "index");
      assert.equal(indexes.includes("idx_steps_episode_id"), true);
      assert.equal(indexes.includes("idx_permission_log_step_id"), true);
      assert.equal(indexes.includes("idx_render_jobs_episode_id"), true);

      const triggers = namesOf(db, "trigger");
      assert.equal(
        triggers.includes("steps_validate_kind_status_insert"),
        true,
      );
      assert.equal(
        triggers.includes("steps_validate_kind_status_update"),
        true,
      );

      assert.deepEqual(
        db
          .prepare("SELECT version, name FROM schema_migrations")
          .all(),
        EXPECTED_MIGRATIONS,
      );

      const stepForeignKeys = db
        .prepare("PRAGMA foreign_key_list(steps)")
        .all() as Array<{
        table: string;
        from: string;
        to: string;
        on_delete: string;
      }>;

      assert.deepEqual(
        stepForeignKeys.map(({ table, from, to, on_delete }) => ({
          table,
          from,
          to,
          on_delete,
        })),
        [
          {
            table: "episodes",
            from: "episode_id",
            to: "id",
            on_delete: "CASCADE",
          },
        ],
      );
    } finally {
      db.close();
    }
  });
});

test("menyimpan data dan membacanya kembali setelah koneksi dibuka ulang", () => {
  withTempDirectory((directory) => {
    const databasePath = path.join(directory, "app.db");
    const first = createDatabase(databasePath);

    try {
      const episodeId = insertEpisode(first);
      const step = first
        .prepare(
          "INSERT INTO steps (episode_id, kind, status, agent_id) VALUES (?, ?, ?, ?)",
        )
        .run(episodeId, "script", "review", "command-code");
      const stepId = Number(step.lastInsertRowid);

      first
        .prepare(
          "INSERT INTO permission_log (step_id, request_summary, decision) VALUES (?, ?, ?)",
        )
        .run(stepId, "Menulis 01-naskah.md", "approved");

      first
        .prepare(
          "INSERT INTO render_jobs (episode_id, status, progress, output_path) VALUES (?, ?, ?, ?)",
        )
        .run(episodeId, "running", 0.5, "episodes/episode-uji/out/episode-uji.mp4");
    } finally {
      first.close();
    }

    const second = createDatabase(databasePath);

    try {
      assert.deepEqual(
        second
          .prepare("SELECT slug, title, topic FROM episodes")
          .all(),
        [
          {
            slug: "episode-uji",
            title: "Episode Uji",
            topic: "Topik Uji",
          },
        ],
      );
      assert.deepEqual(
        second
          .prepare(
            "SELECT kind, status, agent_id FROM steps ORDER BY id",
          )
          .all(),
        [{ kind: "script", status: "review", agent_id: "command-code" }],
      );
      assert.deepEqual(
        second
          .prepare(
            "SELECT request_summary, decision FROM permission_log ORDER BY id",
          )
          .all(),
        [
          {
            request_summary: "Menulis 01-naskah.md",
            decision: "approved",
          },
        ],
      );
      assert.deepEqual(
        second
          .prepare(
            "SELECT status, progress, output_path FROM render_jobs ORDER BY id",
          )
          .all(),
        [
          {
            status: "running",
            progress: 0.5,
            output_path: "episodes/episode-uji/out/episode-uji.mp4",
          },
        ],
      );
      assert.equal(
        (
          second
            .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
            .get() as { count: number }
        ).count,
        3,
      );
    } finally {
      second.close();
    }
  });
});

test("menolak slug duplikat dan hubungan ke data induk yang tidak ada", () => {
  withTempDirectory((directory) => {
    const db = createDatabase(path.join(directory, "app.db"));

    try {
      const episodeId = insertEpisode(db);

      assert.throws(
        () => insertEpisode(db),
        /UNIQUE constraint failed: episodes\.slug/,
      );

      assert.throws(
        () =>
          db
            .prepare("INSERT INTO steps (episode_id, kind) VALUES (?, ?)")
            .run(99999, "script"),
        /FOREIGN KEY constraint failed/,
      );

      assert.throws(
        () =>
          db
            .prepare(
              "INSERT INTO permission_log (step_id, request_summary, decision) VALUES (?, ?, ?)",
            )
            .run(99999, "Izin palsu", "approved"),
        /FOREIGN KEY constraint failed/,
      );

      assert.throws(
        () =>
          db
            .prepare(
              "INSERT INTO render_jobs (episode_id, status) VALUES (?, ?)",
            )
            .run(99999, "queued"),
        /FOREIGN KEY constraint failed/,
      );

      const stepCount = db
        .prepare("SELECT COUNT(*) AS count FROM steps")
        .get() as { count: number };
      const permissionCount = db
        .prepare("SELECT COUNT(*) AS count FROM permission_log")
        .get() as { count: number };
      const renderCount = db
        .prepare("SELECT COUNT(*) AS count FROM render_jobs")
        .get() as { count: number };

      assert.equal(stepCount.count, 0);
      assert.equal(permissionCount.count, 0);
      assert.equal(renderCount.count, 0);
      assert.equal(episodeId, 1);
    } finally {
      db.close();
    }
  });
});

test("menghapus episode ikut menghapus langkah dan data turunannya", () => {
  withTempDirectory((directory) => {
    const db = createDatabase(path.join(directory, "app.db"));

    try {
      const episodeId = insertEpisode(db);
      const stepId = Number(
        db
          .prepare("INSERT INTO steps (episode_id, kind) VALUES (?, ?)")
          .run(episodeId, "script").lastInsertRowid,
      );

      db.prepare(
        "INSERT INTO permission_log (step_id, request_summary, decision) VALUES (?, ?, ?)",
      ).run(stepId, "Izin", "approved");
      db.prepare(
        "INSERT INTO render_jobs (episode_id, status) VALUES (?, ?)",
      ).run(episodeId, "queued");

      db.prepare("DELETE FROM episodes WHERE id = ?").run(episodeId);

      assert.equal(
        (
          db.prepare("SELECT COUNT(*) AS count FROM steps").get() as {
            count: number;
          }
        ).count,
        0,
      );
      assert.equal(
        (
          db
            .prepare("SELECT COUNT(*) AS count FROM permission_log")
            .get() as { count: number }
        ).count,
        0,
      );
      assert.equal(
        (
          db
            .prepare("SELECT COUNT(*) AS count FROM render_jobs")
            .get() as { count: number }
        ).count,
        0,
      );
    } finally {
      db.close();
    }
  });
});

test("hanya menerima kind dan status langkah yang diizinkan", () => {
  withTempDirectory((directory) => {
    const db = createDatabase(path.join(directory, "app.db"));

    try {
      assert.deepEqual(STEP_KINDS, [
        "script",
        "tags",
        "voiceover",
        "scenes",
        "render",
      ]);
      assert.deepEqual(STEP_STATUSES, [
        "idle",
        "running",
        "review",
        "approved",
        "failed",
      ]);

      const episodeId = insertEpisode(db);

      assert.throws(
        () =>
          db
            .prepare("INSERT INTO steps (episode_id, kind) VALUES (?, ?)")
            .run(episodeId, "chat"),
        /invalid step kind or status/,
      );

      assert.throws(
        () =>
          db
            .prepare(
              "INSERT INTO steps (episode_id, kind, status) VALUES (?, ?, ?)",
            )
            .run(episodeId, "script", "done"),
        /invalid step kind or status/,
      );

      const stepId = Number(
        db
          .prepare("INSERT INTO steps (episode_id, kind) VALUES (?, ?)")
          .run(episodeId, "script").lastInsertRowid,
      );

      assert.throws(
        () =>
          db
            .prepare("UPDATE steps SET kind = ? WHERE id = ?")
            .run("chat", stepId),
        /invalid step kind or status/,
      );

      assert.deepEqual(
        db.prepare("SELECT kind, status FROM steps WHERE id = ?").get(stepId),
        { kind: "script", status: "idle" },
      );
    } finally {
      db.close();
    }
  });
});

test("migrasi aman dijalankan berulang tanpa menggandakan data", () => {
  withTempDirectory((directory) => {
    const databasePath = path.join(directory, "app.db");
    const first = createDatabase(databasePath);

    try {
      insertEpisode(first);
    } finally {
      first.close();
    }

    for (let run = 0; run < 2; run += 1) {
      const db = createDatabase(databasePath);

      try {
        assert.equal(
          (
            db
              .prepare("SELECT COUNT(*) AS count FROM episodes")
              .get() as { count: number }
          ).count,
          1,
        );
        assert.deepEqual(
          db.prepare("SELECT version, name FROM schema_migrations").all(),
          EXPECTED_MIGRATIONS,
        );
      } finally {
        db.close();
      }
    }
  });
});

test("migrasi memperbarui database setup sebelumnya tanpa kehilangan data", () => {
  withTempDirectory((directory) => {
    const databasePath = path.join(directory, "legacy.db");
    const legacy = new Database(databasePath);

    try {
      legacy.pragma("foreign_keys = ON");
      legacy.exec(LEGACY_SCHEMA);

      const episodeId = Number(
        legacy
          .prepare(
            "INSERT INTO episodes (slug, title, topic) VALUES (?, ?, ?)",
          )
          .run("episode-lama", "Episode Lama", "Topik Lama").lastInsertRowid,
      );
      const stepId = Number(
        legacy
          .prepare(
            "INSERT INTO steps (episode_id, kind, status) VALUES (?, ?, ?)",
          )
          .run(episodeId, "script", "approved").lastInsertRowid,
      );

      legacy
        .prepare(
          "INSERT INTO permission_log (step_id, request_summary, decision) VALUES (?, ?, ?)",
        )
        .run(stepId, "Izin lama", "approved");
      legacy
        .prepare(
          "INSERT INTO render_jobs (episode_id, status, progress) VALUES (?, ?, ?)",
        )
        .run(episodeId, "queued", 0);
    } finally {
      legacy.close();
    }

    const db = createDatabase(databasePath);

    try {
      assert.deepEqual(
        db.prepare("SELECT slug, title, topic FROM episodes").all(),
        [
          {
            slug: "episode-lama",
            title: "Episode Lama",
            topic: "Topik Lama",
          },
        ],
      );
      assert.deepEqual(
        db.prepare("SELECT kind, status, notes, model_id, effort FROM steps").all(),
        [{ kind: "script", status: "approved", notes: "", model_id: null, effort: null }],
      );
      assert.deepEqual(
        db.prepare("SELECT request_summary, decision FROM permission_log").all(),
        [{ request_summary: "Izin lama", decision: "approved" }],
      );
      assert.deepEqual(
        db.prepare("SELECT status, progress FROM render_jobs").all(),
        [{ status: "queued", progress: 0 }],
      );

      assert.deepEqual(
        db.prepare("SELECT version, name FROM schema_migrations").all(),
        EXPECTED_MIGRATIONS,
      );

      const triggers = namesOf(db, "trigger");
      assert.equal(
        triggers.includes("steps_validate_kind_status_insert"),
        true,
      );
      assert.equal(
        triggers.includes("steps_validate_kind_status_update"),
        true,
      );

      assert.throws(
        () =>
          db
            .prepare("INSERT INTO steps (episode_id, kind) VALUES (?, ?)")
            .run(1, "chat"),
        /invalid step kind or status/,
      );
    } finally {
      db.close();
    }
  });
});
