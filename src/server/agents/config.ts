import fs from "node:fs";
import path from "node:path";
import {
  resolveWorkspaceDir,
  WorkspaceInitializationError,
} from "../workspace/init.ts";
import { resolveWorkspacePath } from "../workspace/paths.ts";

export type AgentConfig = {
  id: string;
  name: string;
  command: string;
  args: string[];
};

export type AgentsConfig = {
  agents: AgentConfig[];
  byId: Map<string, AgentConfig>;
};

export type AgentConfigErrorCode =
  | "workspace"
  | "unsafe-path"
  | "missing-file"
  | "unreadable"
  | "invalid-json"
  | "invalid-shape"
  | "duplicate-id";

export class AgentConfigError extends Error {
  readonly code: AgentConfigErrorCode;
  readonly fix: string;

  constructor(
    code: AgentConfigErrorCode,
    message: string,
    fix: string,
  ) {
    super(message);
    this.name = "AgentConfigError";
    this.code = code;
    this.fix = fix;
  }
}

export type LoadAgentsConfigOptions = {
  workspaceRoot?: string;
};

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 120;
const MAX_COMMAND_LENGTH = 1024;
const MAX_ARG_LENGTH = 4096;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function invalidShape(message: string): AgentConfigError {
  return new AgentConfigError(
    "invalid-shape",
    message,
    "Periksa format agents.json: setiap agen wajib punya id, name, command, dan args.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw invalidShape(`${field} harus berupa teks.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw invalidShape(`${field} wajib diisi.`);
  }

  if (trimmed.length > maxLength) {
    throw invalidShape(
      `${field} maksimal ${maxLength} karakter.`,
    );
  }

  if (CONTROL_CHARACTERS.test(trimmed)) {
    throw invalidShape(`${field} tidak boleh mengandung karakter kontrol.`);
  }

  return trimmed;
}

export function parseAgentsConfig(value: unknown): AgentsConfig {
  if (!isRecord(value)) {
    throw invalidShape("Isi agents.json harus berupa objek JSON.");
  }

  if (!Array.isArray(value.agents)) {
    throw invalidShape("agents.json wajib memiliki array agents.");
  }

  const agents: AgentConfig[] = [];
  const byId = new Map<string, AgentConfig>();

  value.agents.forEach((entry, index) => {
    const field = `agents[${index}]`;

    if (!isRecord(entry)) {
      throw invalidShape(`${field} harus berupa objek.`);
    }

    const id = readRequiredString(entry.id, `${field}.id`, MAX_ID_LENGTH);

    if (!ID_PATTERN.test(id)) {
      throw invalidShape(
        `${field}.id hanya boleh huruf kecil, angka, titik, garis bawah, atau tanda hubung.`,
      );
    }

    if (byId.has(id)) {
      throw new AgentConfigError(
        "duplicate-id",
        `ID agen "${id}" dipakai lebih dari sekali di agents.json.`,
        "Beri ID unik untuk setiap agen.",
      );
    }

    const name = readRequiredString(
      entry.name,
      `${field}.name`,
      MAX_NAME_LENGTH,
    );
    const command = readRequiredString(
      entry.command,
      `${field}.command`,
      MAX_COMMAND_LENGTH,
    );

    if (!Array.isArray(entry.args)) {
      throw invalidShape(`${field}.args harus berupa array teks.`);
    }

    const args = entry.args.map((arg, argIndex) => {
      if (typeof arg !== "string") {
        throw invalidShape(
          `${field}.args[${argIndex}] harus berupa teks.`,
        );
      }

      if (arg.length > MAX_ARG_LENGTH) {
        throw invalidShape(
          `${field}.args[${argIndex}] maksimal ${MAX_ARG_LENGTH} karakter.`,
        );
      }

      if (CONTROL_CHARACTERS.test(arg)) {
        throw invalidShape(
          `${field}.args[${argIndex}] tidak boleh mengandung karakter kontrol.`,
        );
      }

      return arg;
    });

    const agent = { id, name, command, args };
    agents.push(agent);
    byId.set(id, agent);
  });

  return { agents, byId };
}

export function loadAgentsConfig(
  options: LoadAgentsConfigOptions = {},
): AgentsConfig {
  let workspaceRoot: string;

  try {
    workspaceRoot = resolveWorkspaceDir(options.workspaceRoot);
  } catch (error) {
    if (error instanceof WorkspaceInitializationError) {
      throw new AgentConfigError(
        "workspace",
        `Workspace belum siap: ${error.message}`,
        error.fix,
      );
    }

    throw error;
  }

  const resolution = resolveWorkspacePath({
    workspaceRoot,
    area: "root",
    fileName: "agents.json",
  });

  if (!resolution.ok) {
    throw new AgentConfigError(
      "unsafe-path",
      `agents.json tidak bisa diakses (${resolution.reason}).`,
      "Pastikan agents.json adalah file biasa di dalam workspace, bukan symlink.",
    );
  }

  let content: string;

  try {
    content = fs.readFileSync(resolution.path, "utf8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      throw new AgentConfigError(
        "missing-file",
        `agents.json tidak ditemukan di ${path.dirname(resolution.path)}.`,
        "Buat agents.json di workspace atau jalankan ulang inisialisasi workspace.",
      );
    }

    throw new AgentConfigError(
      "unreadable",
      "agents.json tidak bisa dibaca.",
      "Periksa izin file agents.json lalu coba lagi.",
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "JSON tidak valid";
    throw new AgentConfigError(
      "invalid-json",
      `agents.json bukan JSON yang valid: ${detail}.`,
      "Perbaiki sintaks JSON di agents.json.",
    );
  }

  return parseAgentsConfig(parsed);
}
