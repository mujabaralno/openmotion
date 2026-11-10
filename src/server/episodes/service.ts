import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { getDb } from "../db/index.ts";
import {
  initializeWorkspace,
  type WorkspaceEnvironment,
} from "../workspace/init.ts";
import { resolveWorkspacePath } from "../workspace/paths.ts";
import {
  episodeSlugExists,
  insertEpisodeWithSteps,
} from "./repository.ts";
import { slugCandidate, slugifyTitle } from "./slug.ts";
import type { Episode } from "./types.ts";

const MAX_TITLE_LENGTH = 120;
const MAX_TOPIC_LENGTH = 500;
const MAX_SLUG_ATTEMPTS = 50;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export class EpisodeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EpisodeValidationError";
  }
}

export class EpisodeCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EpisodeCreationError";
  }
}

export type CreateEpisodeInput = {
  title: unknown;
  topic?: unknown;
};

export type CreateEpisodeOptions = {
  db?: Database.Database;
  workspaceRoot?: string;
  env?: WorkspaceEnvironment;
  now?: Date;
};

function normalizeField(
  value: unknown,
  field: "Judul" | "Topik",
  maxLength: number,
  required: boolean,
): string {
  if (value === undefined || value === null) {
    if (required) {
      throw new EpisodeValidationError(`${field} wajib diisi.`);
    }

    return "";
  }

  if (typeof value !== "string") {
    throw new EpisodeValidationError(`${field} harus berupa teks.`);
  }

  const trimmed = value.trim();

  if (required && !trimmed) {
    throw new EpisodeValidationError(`${field} wajib diisi.`);
  }

  if (trimmed.length > maxLength) {
    throw new EpisodeValidationError(
      `${field} maksimal ${maxLength} karakter.`,
    );
  }

  if (CONTROL_CHARACTERS.test(trimmed)) {
    throw new EpisodeValidationError(
      `${field} tidak boleh mengandung karakter kontrol.`,
    );
  }

  return trimmed;
}

function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function isUniqueSlugError(error: unknown): boolean {
  return (
    isErrno(error, "SQLITE_CONSTRAINT_UNIQUE") ||
    (error instanceof Error &&
      error.message.includes("UNIQUE constraint failed: episodes.slug"))
  );
}

function removeEpisodeDirectory(directory: string): void {
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // Folder yatim tidak ditampilkan karena tidak ada di database.
  }
}

export function createEpisode(
  input: CreateEpisodeInput,
  options: CreateEpisodeOptions = {},
): Episode {
  const title = normalizeField(
    input.title,
    "Judul",
    MAX_TITLE_LENGTH,
    true,
  );
  const topic = normalizeField(
    input.topic,
    "Topik",
    MAX_TOPIC_LENGTH,
    false,
  );

  const db = options.db ?? getDb();
  const workspace = initializeWorkspace({
    workspaceDir: options.workspaceRoot,
    env: options.env,
  });
  const now = options.now ?? new Date();
  const timestamp = now.toISOString();
  const baseSlug = slugifyTitle(title);

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = slugCandidate(baseSlug, attempt);

    if (episodeSlugExists(slug, db)) continue;

    const resolution = resolveWorkspacePath({
      workspaceRoot: workspace.workspaceRoot,
      area: "episode",
      episodeSlug: slug,
      fileName: "episode.json",
    });

    if (!resolution.ok) {
      throw new EpisodeCreationError(
        `Tidak bisa menyiapkan folder episode "${slug}" (${resolution.reason}).`,
      );
    }

    const episodeDirectory = path.dirname(resolution.path);

    try {
      fs.mkdirSync(episodeDirectory);
    } catch (error) {
      if (isErrno(error, "EEXIST")) continue;

      throw new EpisodeCreationError(
        `Gagal membuat folder episode "${slug}".`,
      );
    }

    const metadata = {
      slug,
      title,
      topic,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    try {
      fs.writeFileSync(
        resolution.path,
        `${JSON.stringify(metadata, null, 2)}\n`,
        { encoding: "utf8", mode: 0o644, flag: "wx" },
      );
    } catch {
      removeEpisodeDirectory(episodeDirectory);
      throw new EpisodeCreationError(
        `Gagal menulis episode.json untuk "${slug}".`,
      );
    }

    try {
      return insertEpisodeWithSteps(metadata, db);
    } catch (error) {
      removeEpisodeDirectory(episodeDirectory);

      if (isUniqueSlugError(error)) continue;

      throw new EpisodeCreationError(
        `Gagal menyimpan episode "${title}" ke database.`,
      );
    }
  }

  throw new EpisodeCreationError(
    `Tidak bisa membuat slug unik untuk "${title}". Coba judul lain.`,
  );
}
