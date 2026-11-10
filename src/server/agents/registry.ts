import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadAgentsConfig } from "./config.ts";
import {
  resolveWorkspaceDir,
  WorkspaceInitializationError,
} from "../workspace/init.ts";
import { resolveWorkspacePath } from "../workspace/paths.ts";

export type AgentSessionStatus =
  | "starting"
  | "running"
  | "exited"
  | "failed"
  | "stopped";

export type AgentSessionSnapshot = {
  sessionId: string;
  agentId: string;
  episodeSlug: string;
  cwd: string;
  status: AgentSessionStatus;
  pid: number | null;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error: string | null;
};

export type StartAgentSessionInput = {
  sessionId: string;
  agentId: string;
  episodeSlug: string;
  workspaceRoot?: string;
};

export type AgentSessionErrorCode =
  | "invalid-session"
  | "invalid-agent"
  | "invalid-episode"
  | "workspace"
  | "unknown-agent"
  | "session-conflict"
  | "unsafe-path"
  | "episode-not-found"
  | "spawn-failed";

export class AgentSessionError extends Error {
  readonly code: AgentSessionErrorCode;

  constructor(code: AgentSessionErrorCode, message: string) {
    super(message);
    this.name = "AgentSessionError";
    this.code = code;
  }
}

type AgentSessionEntry = AgentSessionSnapshot & {
  child: ChildProcess | null;
};

type AgentRegistryState = {
  sessions: Map<string, AgentSessionEntry>;
  shutdownHandlersInstalled: boolean;
};

const REGISTRY_KEY = "__workflowStudioAgentRegistry" as const;
export const AGENT_REGISTRY_GLOBAL_KEY = REGISTRY_KEY;
const SESSION_PATTERN = /^[A-Za-z0-9._:-]+$/;
const MAX_SESSION_ID_LENGTH = 128;

type GlobalWithRegistry = typeof globalThis & {
  [REGISTRY_KEY]?: AgentRegistryState;
};

function getRegistryState(): AgentRegistryState {
  const globalRegistry = globalThis as GlobalWithRegistry;

  if (!globalRegistry[REGISTRY_KEY]) {
    globalRegistry[REGISTRY_KEY] = {
      sessions: new Map(),
      shutdownHandlersInstalled: false,
    };
  }

  return globalRegistry[REGISTRY_KEY];
}

function snapshot(entry: AgentSessionEntry): AgentSessionSnapshot {
  return {
    sessionId: entry.sessionId,
    agentId: entry.agentId,
    episodeSlug: entry.episodeSlug,
    cwd: entry.cwd,
    status: entry.status,
    pid: entry.pid,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    exitCode: entry.exitCode,
    signal: entry.signal,
    error: entry.error,
  };
}

function validateSessionId(sessionId: unknown): string {
  if (
    typeof sessionId !== "string" ||
    sessionId.length === 0 ||
    sessionId.length > MAX_SESSION_ID_LENGTH ||
    !SESSION_PATTERN.test(sessionId)
  ) {
    throw new AgentSessionError(
      "invalid-session",
      "ID sesi tidak valid. Gunakan huruf, angka, titik, garis bawah, titik dua, atau tanda hubung.",
    );
  }

  return sessionId;
}

function validateIdentity(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AgentSessionError(
      field === "agent" ? "invalid-agent" : "invalid-episode",
      `${field === "agent" ? "ID agen" : "Slug episode"} wajib diisi.`,
    );
  }

  return value.trim();
}

function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function killProcessTree(
  entry: AgentSessionEntry,
  signal: NodeJS.Signals,
): void {
  const child = entry.child;
  const pid = entry.pid;

  if (!child) return;

  if (!pid || process.platform === "win32") {
    try {
      child.kill(signal);
    } catch {
      // Proses sudah berhenti.
    }
    return;
  }

  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (isErrno(error, "ESRCH")) return;

    try {
      child.kill(signal);
    } catch {
      // Proses sudah berhenti atau tidak bisa dihentikan.
    }
  }
}

export function startAgentSession(
  input: StartAgentSessionInput,
): AgentSessionSnapshot {
  const sessionId = validateSessionId(input.sessionId);
  const agentId = validateIdentity(input.agentId, "agent");
  const episodeSlug = validateIdentity(input.episodeSlug, "episode");
  const state = getRegistryState();
  const existing = state.sessions.get(sessionId);

  if (existing) {
    if (
      existing.agentId !== agentId ||
      existing.episodeSlug !== episodeSlug
    ) {
      throw new AgentSessionError(
        "session-conflict",
        `Sesi "${sessionId}" sudah dipakai oleh agen/episode lain.`,
      );
    }

    return snapshot(existing);
  }

  let workspaceRoot: string;

  try {
    workspaceRoot = resolveWorkspaceDir(input.workspaceRoot);
  } catch (error) {
    if (error instanceof WorkspaceInitializationError) {
      throw new AgentSessionError(
        "workspace",
        `Workspace belum siap: ${error.message}`,
      );
    }

    throw error;
  }

  const config = loadAgentsConfig({ workspaceRoot });
  const agent = config.byId.get(agentId);

  if (!agent) {
    throw new AgentSessionError(
      "unknown-agent",
      `Agen "${agentId}" tidak terdaftar di agents.json.`,
    );
  }

  const resolution = resolveWorkspacePath({
    workspaceRoot,
    area: "episode",
    episodeSlug,
    fileName: "episode.json",
  });

  if (!resolution.ok) {
    throw new AgentSessionError(
      "unsafe-path",
      `Folder episode "${episodeSlug}" tidak aman (${resolution.reason}).`,
    );
  }

  const cwd = path.dirname(resolution.path);

  try {
    if (!fs.statSync(cwd).isDirectory()) {
      throw new AgentSessionError(
        "episode-not-found",
        `Folder episode "${episodeSlug}" tidak ditemukan.`,
      );
    }
  } catch (error) {
    if (error instanceof AgentSessionError) throw error;

    if (isErrno(error, "ENOENT")) {
      throw new AgentSessionError(
        "episode-not-found",
        `Folder episode "${episodeSlug}" tidak ditemukan.`,
      );
    }

    throw error;
  }

  const startedAt = new Date().toISOString();
  const entry: AgentSessionEntry = {
    sessionId,
    agentId,
    episodeSlug,
    cwd,
    status: "starting",
    pid: null,
    startedAt,
    endedAt: null,
    exitCode: null,
    signal: null,
    error: null,
    child: null,
  };

  state.sessions.set(sessionId, entry);

  try {
    const child = spawn(agent.command, agent.args, {
      cwd,
      detached: true,
      stdio: "ignore",
      env: process.env,
      shell: false,
    });

    entry.child = child;
    entry.pid = child.pid ?? null;

    if (child.pid) {
      entry.status = "running";
    }

    child.once("error", (error) => {
      entry.status = "failed";
      entry.pid = child.pid ?? null;
      entry.error = error.message;
      entry.endedAt = new Date().toISOString();
    });

    child.once("exit", (code, signal) => {
      if (entry.status !== "stopped" && entry.status !== "failed") {
        entry.status = "exited";
      }
      entry.exitCode = code;
      entry.signal = signal;
      entry.endedAt = new Date().toISOString();
    });
  } catch (error) {
    entry.status = "failed";
    entry.error =
      error instanceof Error ? error.message : "Gagal menjalankan proses.";
    entry.endedAt = new Date().toISOString();

    throw new AgentSessionError(
      "spawn-failed",
      `Gagal menjalankan agen "${agentId}": ${entry.error}`,
    );
  }

  return snapshot(entry);
}

export function getAgentSession(
  sessionId: string,
): AgentSessionSnapshot | null {
  const entry = getRegistryState().sessions.get(sessionId);

  return entry ? snapshot(entry) : null;
}

export function listAgentSessions(): AgentSessionSnapshot[] {
  return Array.from(getRegistryState().sessions.values()).map(snapshot);
}

export function stopAgentSession(
  sessionId: string,
  options: { force?: boolean } = {},
): boolean {
  const entry = getRegistryState().sessions.get(sessionId);

  if (!entry) return false;
  if (
    entry.status === "exited" ||
    entry.status === "failed" ||
    entry.status === "stopped"
  ) {
    return false;
  }

  entry.status = "stopped";
  entry.endedAt = new Date().toISOString();
  killProcessTree(entry, options.force ? "SIGKILL" : "SIGTERM");

  return true;
}

export function stopAllAgentSessions(
  options: { force?: boolean } = {},
): number {
  let stopped = 0;

  for (const sessionId of getRegistryState().sessions.keys()) {
    if (stopAgentSession(sessionId, options)) {
      stopped += 1;
    }
  }

  return stopped;
}

export function installAgentShutdownHandlers(): void {
  const state = getRegistryState();

  if (state.shutdownHandlersInstalled) return;

  state.shutdownHandlersInstalled = true;

  const cleanup = () => {
    stopAllAgentSessions({ force: true });
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    cleanup();
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    process.kill(process.pid, signal);
  };

  const onSigint = () => handleSignal("SIGINT");
  const onSigterm = () => handleSignal("SIGTERM");

  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  process.once("exit", cleanup);
}

export function resetAgentRegistryForTests(): void {
  stopAllAgentSessions({ force: true });
  delete (globalThis as GlobalWithRegistry)[REGISTRY_KEY];
}
