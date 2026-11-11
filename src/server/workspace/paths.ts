import fs from "node:fs";
import path from "node:path";

export type WorkspaceArea =
  | "research"
  | "root"
  | "prompts"
  | "guide"
  | "episode"
  | "logs"
  | "out"
  | "composition"
  | "composition-public"
  | "project-composition"
  | "project-public";

export const WORKSPACE_FILE_WHITELIST: Record<
  Exclude<WorkspaceArea, "out">,
  readonly string[]
> = {
  root: ["agents.json"],
  research: ["AGENTS.md"],
  prompts: ["script.md", "tags.md", "scenes.md", "thumbnail.md", "publish.md"],
  guide: ["style-parallax.md"],
  episode: [
    "episode.json",
    "01-episode.md",
    "03-audio.json",
    "04-scenes.json",
    "05-thumbnail.svg",
    "06-publish.md",
    "AGENTS.md",
    "01-naskah.md",
    "02-naskah-tagged.md",
    "03-voiceover.mp3",
    "03-voiceover.timestamps.json",
  ],
  composition: ["Episode.tsx", "index.tsx", "props.json"],
  "composition-public": ["audio.mp3", "timestamps.json"],
  "project-composition": ["Episode.tsx", "index.tsx", "props.json"],
  "project-public": ["audio.mp3", "timestamps.json", "sfx-whoosh.wav", "sfx-pop.wav", "sfx-tap.wav"],
  logs: [
    "script.jsonl",
    "tags.jsonl",
    "voiceover.jsonl",
    "scenes.jsonl",
    "render.jsonl",
    "thumbnail.jsonl",
    "publish.jsonl",
  ],
};

const AREA_DIRECTORIES: Record<
  WorkspaceArea,
  { directory: string; scopedToEpisode: boolean; episodeBase?: string }
> = {
  root: { directory: "", scopedToEpisode: false },
  research: { directory: "research", scopedToEpisode: false },
  prompts: { directory: "prompts", scopedToEpisode: false },
  guide: { directory: "guide", scopedToEpisode: false },
  episode: { directory: "", scopedToEpisode: true },
  logs: { directory: "logs", scopedToEpisode: true },
  out: { directory: "out", scopedToEpisode: true },
  composition: { directory: "remotion", scopedToEpisode: true },
  "composition-public": { directory: "remotion/public", scopedToEpisode: true },
  "project-composition": { directory: "", scopedToEpisode: true, episodeBase: "src/episodes" },
  "project-public": { directory: "", scopedToEpisode: true, episodeBase: "public/episodes" },
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 64;

export type WorkspacePathReason =
  | "invalid-workspace"
  | "invalid-area"
  | "invalid-slug"
  | "invalid-filename"
  | "filename-not-allowed"
  | "outside-workspace"
  | "symlink"
  | "not-a-file"
  | "not-a-directory"
  | "unreadable";

export type WorkspacePathRequest = {
  workspaceRoot: string;
  area: WorkspaceArea;
  fileName: string;
  episodeSlug?: string;
};

export type WorkspacePathResult =
  | { ok: true; path: string; relativePath: string }
  | { ok: false; reason: WorkspacePathReason };

function deny(reason: WorkspacePathReason): WorkspacePathResult {
  return { ok: false, reason };
}

function isInside(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate);

  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
}

function isValidSlug(slug: string | undefined): slug is string {
  return (
    typeof slug === "string" &&
    slug.length > 0 &&
    slug.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(slug)
  );
}

function isSafeFileName(fileName: string): boolean {
  if (typeof fileName !== "string" || fileName.length === 0) return false;
  if (fileName === "." || fileName === "..") return false;
  if (/[\u0000-\u001f]/.test(fileName)) return false;
  if (fileName.includes("/") || fileName.includes("\\")) return false;
  if (path.isAbsolute(fileName)) return false;
  if (path.basename(fileName) !== fileName) return false;

  return true;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function inspectExistingPath(
  root: string,
  target: string,
): WorkspacePathReason | null {
  const relative = path.relative(root, target);
  if (!relative) return null;

  const segments = relative.split(path.sep).filter(Boolean);
  let current = root;

  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);

    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(current);
    } catch (error) {
      if (isMissingFileError(error)) return null;
      return "unreadable";
    }

    if (stats.isSymbolicLink()) {
      return "symlink";
    }

    const isTarget = index === segments.length - 1;

    if (isTarget) {
      if (!stats.isFile()) return "not-a-file";
    } else if (!stats.isDirectory()) {
      return "not-a-directory";
    }
  }

  return null;
}

export function resolveWorkspacePath(
  request: WorkspacePathRequest,
): WorkspacePathResult {
  if (!request.workspaceRoot || !path.isAbsolute(request.workspaceRoot)) {
    return deny("invalid-workspace");
  }

  const root = path.resolve(request.workspaceRoot);

  try {
    if (!fs.statSync(root).isDirectory()) {
      return deny("invalid-workspace");
    }
  } catch {
    return deny("invalid-workspace");
  }

  const area = AREA_DIRECTORIES[request.area];
  if (!area) {
    return deny("invalid-area");
  }

  if (!isSafeFileName(request.fileName)) {
    return deny("invalid-filename");
  }

  let episodeSlug: string | undefined;
  let base = root;

  if (area.scopedToEpisode) {
    if (!isValidSlug(request.episodeSlug)) {
      return deny("invalid-slug");
    }

    episodeSlug = request.episodeSlug;
    base = path.join(/*turbopackIgnore: true*/ root, area.episodeBase ?? "episodes", episodeSlug);

    if (!isInside(root, base)) {
      return deny("outside-workspace");
    }
  }

  if (request.area === "out") {
    if (!episodeSlug || (request.fileName !== `${episodeSlug}.mp4` && request.fileName !== "preview.mp4")) {
      return deny("filename-not-allowed");
    }
  } else {
    const whitelist = WORKSPACE_FILE_WHITELIST[request.area];
    if (!whitelist.includes(request.fileName)) {
      return deny("filename-not-allowed");
    }
  }

  const target = path.join(
    /*turbopackIgnore: true*/ base,
    area.directory,
    request.fileName,
  );

  if (!isInside(root, target)) {
    return deny("outside-workspace");
  }

  const inspection = inspectExistingPath(root, target);
  if (inspection) {
    return deny(inspection);
  }

  return {
    ok: true,
    path: target,
    relativePath: path.relative(root, target),
  };
}
