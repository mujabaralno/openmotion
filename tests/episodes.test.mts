import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type Database from "better-sqlite3";
import { createDatabase } from "../src/server/db/index.ts";
import {
  getEpisodeBySlug,
  listEpisodes,
} from "../src/server/episodes/repository.ts";
import {
  createEpisode,
  EpisodeCreationError,
  EpisodeValidationError,
} from "../src/server/episodes/service.ts";
import { slugifyTitle } from "../src/server/episodes/slug.ts";
import { initializeWorkspace } from "../src/server/workspace/init.ts";

type Fixture = {
  db: Database.Database;
  dbPath: string;
  workspaceRoot: string;
  cleanup: () => void;
};

function createFixture(): Fixture {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-episode-"));
  const dbPath = path.join(parent, "data", "app.db");
  const workspaceRoot = path.join(parent, "workspace");
  const db = createDatabase(dbPath);

  return {
    db,
    dbPath,
    workspaceRoot,
    cleanup: () => {
      try {
        db.close();
      } catch {
        // Sudah ditutup oleh tes persistensi.
      }
      fs.rmSync(parent, { recursive: true, force: true });
    },
  };
}

function withFixture(run: (fixture: Fixture) => void) {
  const fixture = createFixture();

  try {
    run(fixture);
  } finally {
    fixture.cleanup();
  }
}

function episodeDirectory(workspaceRoot: string, slug: string): string {
  return path.join(workspaceRoot, "episodes", slug);
}

function readMetadata(workspaceRoot: string, slug: string) {
  return JSON.parse(
    fs.readFileSync(
      path.join(episodeDirectory(workspaceRoot, slug), "episode.json"),
      "utf8",
    ),
  );
}

function countRows(db: Database.Database, table: string): number {
  return (
    db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
      count: number;
    }
  ).count;
}

test("membuat slug aman dari judul", () => {
  assert.equal(
    slugifyTitle("Misteri di Balik Pintu"),
    "misteri-di-balik-pintu",
  );
  assert.equal(slugifyTitle("Café déjà vu!"), "cafe-deja-vu");
  assert.equal(slugifyTitle("   ---   "), "episode");
  assert.equal(slugifyTitle("Judul & Simbol!!!"), "judul-simbol");

  const longSlug = slugifyTitle("a".repeat(100));

  assert.equal(longSlug.length, 60);
  assert.match(longSlug, /^[a-z0-9-]+$/);
  assert.equal(longSlug.endsWith("-"), false);
});

test("membuat episode, folder, episode.json, dan lima langkah idle", () => {
  withFixture(({ db, workspaceRoot }) => {
    const now = new Date("2026-01-02T03:04:05.000Z");
    const episode = createEpisode(
      { title: "Episode Uji", topic: "Topik Uji" },
      { db, workspaceRoot, now },
    );

    assert.equal(episode.slug, "episode-uji");
    assert.equal(episode.title, "Episode Uji");
    assert.equal(episode.topic, "Topik Uji");
    assert.equal(episode.createdAt, now.toISOString());
    assert.equal(episode.updatedAt, now.toISOString());
    assert.deepEqual(
      episode.steps.map((step) => step.kind),
      ["script", "tags", "voiceover", "scenes", "render"],
    );
    assert.deepEqual(
      episode.steps.map((step) => step.status),
      ["idle", "idle", "idle", "idle", "idle"],
    );

    const row = db
      .prepare(
        "SELECT slug, title, topic, created_at, updated_at FROM episodes WHERE id = ?",
      )
      .get(episode.id) as {
      slug: string;
      title: string;
      topic: string;
      created_at: string;
      updated_at: string;
    };

    assert.deepEqual(row, {
      slug: "episode-uji",
      title: "Episode Uji",
      topic: "Topik Uji",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    const steps = db
      .prepare(
        "SELECT kind, status FROM steps WHERE episode_id = ? ORDER BY id",
      )
      .all(episode.id) as Array<{ kind: string; status: string }>;

    assert.deepEqual(steps, [
      { kind: "script", status: "idle" },
      { kind: "tags", status: "idle" },
      { kind: "voiceover", status: "idle" },
      { kind: "scenes", status: "idle" },
      { kind: "render", status: "idle" },
    ]);

    const directory = episodeDirectory(workspaceRoot, episode.slug);
    assert.equal(fs.statSync(directory).isDirectory(), true);
    assert.deepEqual(readMetadata(workspaceRoot, episode.slug), {
      slug: "episode-uji",
      title: "Episode Uji",
      topic: "Topik Uji",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    assert.deepEqual(listEpisodes(db), [episode]);
  });
});

test("judul yang sama menghasilkan slug dan folder berbeda", () => {
  withFixture(({ db, workspaceRoot }) => {
    const first = createEpisode(
      { title: "Judul Sama", topic: "Pertama" },
      { db, workspaceRoot },
    );
    const second = createEpisode(
      { title: "Judul Sama", topic: "Kedua" },
      { db, workspaceRoot },
    );

    assert.equal(first.slug, "judul-sama");
    assert.equal(second.slug, "judul-sama-2");
    assert.notEqual(first.slug, second.slug);
    assert.equal(countRows(db, "episodes"), 2);

    assert.equal(
      fs.existsSync(episodeDirectory(workspaceRoot, first.slug)),
      true,
    );
    assert.equal(
      fs.existsSync(episodeDirectory(workspaceRoot, second.slug)),
      true,
    );
    assert.equal(readMetadata(workspaceRoot, first.slug).topic, "Pertama");
    assert.equal(readMetadata(workspaceRoot, second.slug).topic, "Kedua");

    assert.deepEqual(
      listEpisodes(db).map((episode) => episode.slug),
      ["judul-sama-2", "judul-sama"],
    );
  });
});

test("menghindari slug yang sudah dipakai database atau folder", () => {
  withFixture(({ db, workspaceRoot }) => {
    initializeWorkspace({ workspaceDir: workspaceRoot });
    fs.mkdirSync(
      path.join(workspaceRoot, "episodes", "judul-folder"),
      { recursive: true },
    );

    db.prepare(
      "INSERT INTO episodes (slug, title, topic) VALUES (?, ?, ?)",
    ).run("judul-database", "Lama", "");

    const folderCollision = createEpisode(
      { title: "Judul Folder" },
      { db, workspaceRoot },
    );
    const databaseCollision = createEpisode(
      { title: "Judul Database" },
      { db, workspaceRoot },
    );

    assert.equal(folderCollision.slug, "judul-folder-2");
    assert.equal(databaseCollision.slug, "judul-database-2");
    assert.equal(
      fs.existsSync(
        path.join(workspaceRoot, "episodes", "judul-folder"),
      ),
      true,
    );
    assert.equal(countRows(db, "episodes"), 3);
  });
});

test("menolak masukan episode yang tidak valid tanpa menulis data", () => {
  withFixture(({ db, workspaceRoot }) => {
    const invalidInputs = [
      { title: "" },
      { title: "   " },
      { title: undefined },
      { title: 123 },
      { title: "a".repeat(121) },
      { title: "Judul", topic: 123 },
      { title: "Judul", topic: "a".repeat(501) },
      { title: "Judul\nBaru" },
      { title: "Judul", topic: "Topik\tBaru" },
    ];

    for (const input of invalidInputs) {
      assert.throws(
        () => createEpisode(input, { db, workspaceRoot }),
        (error) => error instanceof EpisodeValidationError,
      );
    }

    assert.equal(countRows(db, "episodes"), 0);
    assert.equal(countRows(db, "steps"), 0);
    assert.equal(fs.existsSync(workspaceRoot), false);
  });
});

test("membaca status langkah dari SQLite, bukan dari file metadata", () => {
  withFixture(({ db, workspaceRoot }) => {
    const episode = createEpisode(
      { title: "Episode Status", topic: "" },
      { db, workspaceRoot },
    );

    db.prepare(
      "UPDATE steps SET status = ? WHERE episode_id = ? AND kind = ?",
    ).run("review", episode.id, "script");
    db.prepare(
      "UPDATE steps SET status = ? WHERE episode_id = ? AND kind = ?",
    ).run("approved", episode.id, "tags");
    db.prepare(
      "UPDATE steps SET status = ? WHERE episode_id = ? AND kind = ?",
    ).run("failed", episode.id, "render");

    const detail = getEpisodeBySlug(episode.slug, db);
    const listed = listEpisodes(db)[0];

    assert.ok(detail);
    assert.deepEqual(
      detail.steps.map((step) => `${step.kind}:${step.status}`),
      [
        "script:review",
        "tags:approved",
        "voiceover:idle",
        "scenes:idle",
        "render:failed",
      ],
    );
    assert.deepEqual(listed.steps, detail.steps);
  });
});

test("data episode dan status tetap ada setelah database dibuka ulang", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-episode-"));
  const dbPath = path.join(parent, "data", "app.db");
  const workspaceRoot = path.join(parent, "workspace");
  let db = createDatabase(dbPath);

  try {
    const created = createEpisode(
      { title: "Episode Persisten", topic: "Tetap ada" },
      { db, workspaceRoot },
    );

    db.prepare(
      "UPDATE steps SET status = ? WHERE episode_id = ? AND kind = ?",
    ).run("approved", created.id, "script");

    db.close();
    db = createDatabase(dbPath);

    const loaded = getEpisodeBySlug(created.slug, db);

    assert.ok(loaded);
    assert.equal(loaded.title, "Episode Persisten");
    assert.equal(loaded.topic, "Tetap ada");
    assert.deepEqual(
      loaded.steps.map((step) => step.status),
      ["approved", "idle", "idle", "idle", "idle"],
    );
    assert.equal(
      fs.existsSync(
        path.join(episodeDirectory(workspaceRoot, created.slug), "episode.json"),
      ),
      true,
    );
    assert.equal(listEpisodes(db).length, 1);
  } finally {
    try {
      db.close();
    } catch {
      // Sudah ditutup.
    }
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("kegagalan database membersihkan folder dan tidak menyisakan episode", () => {
  withFixture(({ db, workspaceRoot }) => {
    db.exec(`
      CREATE TRIGGER fail_episode_insert
      BEFORE INSERT ON episodes
      BEGIN
        SELECT RAISE(ABORT, 'forced failure');
      END;
    `);

    assert.throws(
      () =>
        createEpisode(
          { title: "Episode Gagal", topic: "" },
          { db, workspaceRoot },
        ),
      (error) => error instanceof EpisodeCreationError,
    );

    assert.equal(countRows(db, "episodes"), 0);
    assert.equal(countRows(db, "steps"), 0);

    const episodesDirectory = path.join(workspaceRoot, "episodes");
    assert.deepEqual(fs.readdirSync(episodesDirectory), []);
  });
});

test("daftar kosong dan detail yang tidak ada ditangani dengan jelas", () => {
  withFixture(({ db }) => {
    assert.deepEqual(listEpisodes(db), []);
    assert.equal(getEpisodeBySlug("tidak-ada", db), null);
  });
});
