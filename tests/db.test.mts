import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDatabase } from "../src/server/db/index.ts";

test("database membuat tabel dan bisa menulis lalu membaca data", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-studio-"));
  const databasePath = path.join(directory, "test.db");
  const db = createDatabase(databasePath);

  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((table) => (table as { name: string }).name);

    assert.deepEqual(tables, [
      "episodes",
      "permission_log",
      "render_jobs",
      "steps",
    ]);

    const result = db
      .prepare("INSERT INTO episodes (slug, title, topic) VALUES (?, ?, ?)")
      .run("episode-uji", "Episode Uji", "Topik Uji");

    const episode = db
      .prepare("SELECT slug, title, topic FROM episodes WHERE id = ?")
      .get(result.lastInsertRowid);

    assert.deepEqual(episode, {
      slug: "episode-uji",
      title: "Episode Uji",
      topic: "Topik Uji",
    });
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
