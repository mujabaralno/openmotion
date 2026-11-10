import type Database from "better-sqlite3";
import {
  getDb,
  STEP_KINDS,
  type StepKind,
  type StepStatus,
} from "../db/index.ts";
import type { Episode, EpisodeStep } from "./types.ts";

type EpisodeRow = {
  id: number;
  slug: string;
  title: string;
  topic: string;
  created_at: string;
  updated_at: string;
};

type StepRow = {
  episode_id: number;
  kind: string;
  status: string;
};

export type NewEpisodeRecord = {
  slug: string;
  title: string;
  topic: string;
  createdAt: string;
  updatedAt: string;
};

const STEP_ORDER = new Map<StepKind, number>(
  STEP_KINDS.map((kind, index) => [kind, index]),
);

function sortSteps(steps: EpisodeStep[]): EpisodeStep[] {
  return steps.sort(
    (left, right) =>
      (STEP_ORDER.get(left.kind) ?? Number.MAX_SAFE_INTEGER) -
      (STEP_ORDER.get(right.kind) ?? Number.MAX_SAFE_INTEGER),
  );
}

function toEpisode(row: EpisodeRow, steps: EpisodeStep[]): Episode {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    topic: row.topic,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    steps: sortSteps(steps),
  };
}

function stepsForEpisode(
  rows: StepRow[],
  episodeId: number,
): EpisodeStep[] {
  return rows
    .filter((row) => row.episode_id === episodeId)
    .map((row) => ({
      kind: row.kind as StepKind,
      status: row.status as StepStatus,
    }));
}

export function listEpisodes(db: Database.Database = getDb()): Episode[] {
  const episodes = db
    .prepare(
      "SELECT id, slug, title, topic, created_at, updated_at FROM episodes ORDER BY id DESC",
    )
    .all() as EpisodeRow[];
  const steps = db
    .prepare("SELECT episode_id, kind, status FROM steps ORDER BY id ASC")
    .all() as StepRow[];

  return episodes.map((episode) =>
    toEpisode(episode, stepsForEpisode(steps, episode.id)),
  );
}

export function getEpisodeBySlug(
  slug: string,
  db: Database.Database = getDb(),
): Episode | null {
  const episode = db
    .prepare(
      "SELECT id, slug, title, topic, created_at, updated_at FROM episodes WHERE slug = ?",
    )
    .get(slug) as EpisodeRow | undefined;

  if (!episode) return null;

  const steps = db
    .prepare(
      "SELECT episode_id, kind, status FROM steps WHERE episode_id = ? ORDER BY id ASC",
    )
    .all(episode.id) as StepRow[];

  return toEpisode(episode, stepsForEpisode(steps, episode.id));
}

export function episodeSlugExists(
  slug: string,
  db: Database.Database = getDb(),
): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM episodes WHERE slug = ?").get(slug),
  );
}

export function getStepIdByKind(
  episodeSlug: string,
  kind: StepKind,
  db: Database.Database = getDb(),
): number | null {
  const row = db
    .prepare(
      `SELECT steps.id AS id
       FROM steps
       JOIN episodes ON episodes.id = steps.episode_id
       WHERE episodes.slug = ? AND steps.kind = ?`,
    )
    .get(episodeSlug, kind) as { id: number } | undefined;

  return row ? Number(row.id) : null;
}

export function insertEpisodeWithSteps(
  record: NewEpisodeRecord,
  db: Database.Database = getDb(),
): Episode {
  const insertEpisode = db.prepare(
    "INSERT INTO episodes (slug, title, topic, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertStep = db.prepare(
    "INSERT INTO steps (episode_id, kind, status) VALUES (?, ?, 'idle')",
  );

  const create = db.transaction(() => {
    const result = insertEpisode.run(
      record.slug,
      record.title,
      record.topic,
      record.createdAt,
      record.updatedAt,
    );
    const episodeId = Number(result.lastInsertRowid);

    for (const kind of STEP_KINDS) {
      insertStep.run(episodeId, kind);
    }

    return episodeId;
  });

  const episodeId = create();

  return {
    id: episodeId,
    slug: record.slug,
    title: record.title,
    topic: record.topic,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    steps: STEP_KINDS.map(
      (kind): EpisodeStep => ({ kind, status: "idle" }),
    ),
  };
}
