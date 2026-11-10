import fs from "node:fs";
import path from "node:path";
import type { AcpUpdate } from "../acp/types.ts";
import type { StepKind } from "../db/index.ts";
import { resolveWorkspacePath } from "../workspace/paths.ts";
import { AgentStreamError } from "./errors.ts";
import type { AgentStreamEvent, PermissionRecord } from "./types.ts";

export type StepHistory = {
  attemptId: string | null;
  events: AgentStreamEvent[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEvent(value: unknown): AgentStreamEvent | null {
  if (!isRecord(value)) return null;
  if (typeof value.attemptId !== "string") return null;
  if (typeof value.seq !== "number" || !Number.isInteger(value.seq)) {
    return null;
  }
  if (typeof value.at !== "string") return null;
  if (value.type === "prompt") {
    if (typeof value.text !== "string") return null;
    return {
      seq: value.seq,
      attemptId: value.attemptId,
      type: "prompt",
      text: value.text,
      at: value.at,
    };
  }
  if (value.type === "update") {
    if (!isRecord(value.update)) return null;
    return {
      seq: value.seq,
      attemptId: value.attemptId,
      type: "update",
      update: value.update as AcpUpdate,
      at: value.at,
    };
  }
  if (value.type === "permission") {
    if (!isRecord(value.permission)) return null;
    if (typeof value.permission.id !== "string") return null;
    return {
      seq: value.seq,
      attemptId: value.attemptId,
      type: "permission",
      permission: value.permission as PermissionRecord,
      at: value.at,
    };
  }
  if (value.type === "permission-mode") {
    if (typeof value.enabled !== "boolean") return null;
    return {
      seq: value.seq,
      attemptId: value.attemptId,
      type: "permission-mode",
      enabled: value.enabled,
      at: value.at,
    };
  }
  if (value.type === "status") {
    if (
      value.status !== "idle" &&
      value.status !== "running" &&
      value.status !== "completed" &&
      value.status !== "failed"
    ) {
      return null;
    }
    return {
      seq: value.seq,
      attemptId: value.attemptId,
      type: "status",
      status: value.status,
      at: value.at,
      ...(typeof value.agentId === "string"
        ? { agentId: value.agentId }
        : {}),
      ...(typeof value.stopReason === "string"
        ? { stopReason: value.stopReason }
        : {}),
      ...(typeof value.error === "string"
        ? { error: value.error }
        : {}),
    };
  }
  return null;
}

export function getStepLogPath(
  workspaceRoot: string,
  episodeSlug: string,
  kind: StepKind,
): string {
  const resolution = resolveWorkspacePath({
    workspaceRoot,
    area: "logs",
    episodeSlug,
    fileName: `${kind}.jsonl`,
  });

  if (!resolution.ok) {
    throw new AgentStreamError(
      "invalid-log-path",
      `Log langkah tidak aman (${resolution.reason}).`,
    );
  }

  return resolution.path;
}

export function appendStepEvent(
  logPath: string,
  event: AgentStreamEvent,
): void {
  fs.mkdirSync(path.dirname(logPath), {
    recursive: true,
    mode: 0o700,
  });
  fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  try {
    fs.chmodSync(logPath, 0o600);
  } catch {
    // Mode file bisa diatur oleh sistem file.
  }
}

export function readLatestAttempt(logPath: string): StepHistory {
  let content: string;

  try {
    content = fs.readFileSync(logPath, "utf8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return { attemptId: null, events: [] };
    }

    throw new AgentStreamError(
      "invalid-log-path",
      "Riwayat langkah tidak bisa dibaca.",
    );
  }

  const attempts = new Map<string, AgentStreamEvent[]>();

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const event = parseEvent(parsed);
    if (!event) continue;

    const events = attempts.get(event.attemptId);
    if (events) {
      events.push(event);
    } else {
      attempts.set(event.attemptId, [event]);
    }
  }

  const entries = Array.from(attempts.entries());
  if (entries.length === 0) {
    return { attemptId: null, events: [] };
  }

  const [attemptId, events] = entries[entries.length - 1];

  return {
    attemptId,
    events: events.sort((left, right) => left.seq - right.seq),
  };
}
