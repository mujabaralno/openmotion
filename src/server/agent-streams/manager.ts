import fs from "node:fs";
import { redactValue, redactText, safeStreamPrefix } from "../security/redact.ts";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { AcpSession } from "../acp/client.ts";
import type {
  AcpPermissionDecision,
  AcpPermissionOption,
  AcpPermissionRequest,
  AcpUpdate,
} from "../acp/types.ts";
import {
  getDb,
  STEP_KINDS,
  type StepKind,
} from "../db/index.ts";
import {
  resolveWorkspaceDir,
} from "../workspace/init.ts";
import { resolveWorkspacePath } from "../workspace/paths.ts";
import { stopAllAgentSessions } from "../agents/registry.ts";
import { AgentStreamError, PermissionError } from "./errors.ts";
import {
  appendStepEvent,
  getStepLogPath,
  readLatestAttempt,
} from "./history.ts";
import type {
  AgentStreamEvent,
  AgentStreamStatus,
  PermissionRecord,
} from "./types.ts";

export type StartStepStreamOptions = {
  episodeSlug: string;
  kind: StepKind;
  agentId: string;
  prompt: string;
  modelId?: string | null;
  effort?: string | null;
  workspaceRoot?: string;
  workingDirectory?: 'episode' | 'remotion';
  stepId?: number | null;
  db?: Database.Database;
  onComplete?: () => Promise<void>;
  onFailure?: (message: string) => void;
  onSettled?: () => void;
};

export type StepStreamInfo = {
  attemptId: string;
  episodeSlug: string;
  kind: StepKind;
  agentId: string;
  status: AgentStreamStatus;
};

export type StepStreamSubscription = {
  attemptId: string | null;
  replay: AgentStreamEvent[];
  terminal: boolean;
  unsubscribe: () => void;
};

type Subscriber = (event: AgentStreamEvent) => void;

type PendingPermission = {
  record: PermissionRecord;
  resolve: (decision: AcpPermissionDecision) => void;
};

type StreamState = {
  attemptId: string;
  episodeSlug: string;
  kind: StepKind;
  agentId: string;
  status: AgentStreamStatus;
  events: AgentStreamEvent[];
  seq: number;
  subscribers: Set<Subscriber>;
  acp: AcpSession | null;
  logPath: string;
  terminal: boolean;
  stepId: number | null;
  db: Database.Database | null;
  autoApprovePermissions: boolean;
  pendingPermissions: Map<string, PendingPermission>;
  textTail?: string;
  tailUpdate?: AcpUpdate;
};

type StreamsState = {
  streams: Map<string, StreamState>;
};

const STREAMS_KEY = "__workflowStudioAgentStreams" as const;

type GlobalWithStreams = typeof globalThis & {
  [STREAMS_KEY]?: StreamsState;
};

function getStreamsState(): StreamsState {
  const globalStreams = globalThis as GlobalWithStreams;

  if (!globalStreams[STREAMS_KEY]) {
    globalStreams[STREAMS_KEY] = { streams: new Map() };
  }

  return globalStreams[STREAMS_KEY];
}

function streamKey(episodeSlug: string, kind: StepKind): string {
  return `${episodeSlug}:${kind}`;
}

function isStepKind(value: string): value is StepKind {
  return (STEP_KINDS as readonly string[]).includes(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function publish(state: StreamState, event: AgentStreamEvent): void {
  event = redactValue(event);
  state.events.push(event);

  try {
    appendStepEvent(state.logPath, event);
  } catch (error) {
    console.error(
      `[agent-stream] Gagal menulis log: ${errorMessage(error)}`,
    );
  }

  if (event.type === "status" && event.status !== "running") {
    state.status = event.status;
    state.terminal = true;
  }

  for (const subscriber of state.subscribers) {
    try {
      subscriber(event);
    } catch (error) {
      console.error(
        `[agent-stream] Subscriber gagal: ${errorMessage(error)}`,
      );
    }
  }
}

function emitPrompt(state: StreamState, text: string): void {
  publish(state, {
    seq: state.seq + 1,
    attemptId: state.attemptId,
    type: "prompt",
    text,
    at: new Date().toISOString(),
  });
  state.seq += 1;
}

function emitUpdate(state: StreamState, update: AcpUpdate): void {
  if (update.sessionUpdate === "agent_thought_chunk") return;
  if (update.sessionUpdate === "agent_message_chunk" && typeof update.content?.text === "string") {
    const result = safeStreamPrefix((state.textTail ?? "") + update.content.text);
    state.textTail = result.rest;
    state.tailUpdate = update;
    if (!result.text) return;
    update = { ...update, content: { ...update.content, text: result.text } };
  }
  publish(state, {
    seq: state.seq + 1,
    attemptId: state.attemptId,
    type: "update",
    update,
    at: new Date().toISOString(),
  });
  state.seq += 1;
}

function emitStatus(
  state: StreamState,
  status: AgentStreamStatus,
  extra: { stopReason?: string; error?: string } = {},
): void {
  if (status !== "running") {
    if (state.textTail && state.tailUpdate) {
      const tail = redactText(state.textTail);
      state.textTail = "";
      publish(state, { seq: state.seq + 1, attemptId: state.attemptId, type: "update", update: { ...state.tailUpdate, content: { ...state.tailUpdate.content, text: tail } }, at: new Date().toISOString() });
      state.seq += 1;
    }
    expirePendingPermissions(state);
  }

  publish(state, {
    seq: state.seq + 1,
    attemptId: state.attemptId,
    type: "status",
    status,
    at: new Date().toISOString(),
    agentId: state.agentId,
    ...extra,
  });
  state.seq += 1;
}

function emitPermission(
  state: StreamState,
  permission: PermissionRecord,
): void {
  publish(state, {
    seq: state.seq + 1,
    attemptId: state.attemptId,
    type: "permission",
    permission,
    at: new Date().toISOString(),
  });
  state.seq += 1;
}

function emitPermissionMode(
  state: StreamState,
  enabled: boolean,
): void {
  publish(state, {
    seq: state.seq + 1,
    attemptId: state.attemptId,
    type: "permission-mode",
    enabled,
    at: new Date().toISOString(),
  });
  state.seq += 1;
}

function selectPermissionOptions(options: AcpPermissionOption[]): {
  allow: AcpPermissionOption | undefined;
  reject: AcpPermissionOption | undefined;
} {
  return {
    allow:
      options.find((option) => option.kind === "allow_once"),
    reject:
      options.find((option) => option.kind === "reject_once"),
  };
}

function permissionRequestSummary(request: AcpPermissionRequest): {
  title: string;
  summary: string;
} {
  const title = request.toolCall?.title?.trim() || "Aksi agen";
  const parts = [title];

  if (request.toolCall?.kind) parts.push(request.toolCall.kind);
  if (request.toolCall?.toolCallId) {
    parts.push(request.toolCall.toolCallId);
  }

  if (request.toolCall?.rawInput !== undefined) parts.push(String(JSON.stringify(request.toolCall.rawInput)).slice(0, 5000));
  if (request.toolCall?.locations !== undefined) parts.push(String(JSON.stringify(request.toolCall.locations)).slice(0, 1000));
  return { title, summary: redactText(parts.join(" | ")) };
}

function createPermissionRecord(
  state: StreamState,
  request: AcpPermissionRequest,
): PermissionRecord {
  const { title, summary } = permissionRequestSummary(request);

  return {
    id: randomUUID(),
    attemptId: state.attemptId,
    episodeSlug: state.episodeSlug,
    stepKind: state.kind,
    stepId: state.stepId,
    title,
    summary,
    toolCallId: request.toolCall?.toolCallId,
    toolKind: request.toolCall?.kind,
    ...(request.toolCall?.rawInput !== undefined ? { input: redactValue(request.toolCall.rawInput) } : {}),
    options: request.options,
    status: "pending",
    auto: state.autoApprovePermissions,
    requestedAt: new Date().toISOString(),
  };
}

function persistPermissionDecision(
  state: StreamState,
  permission: PermissionRecord,
  decisionLabel: string,
): void {
  if (!state.stepId) {
    throw new PermissionError(
      "log-failed",
      "Langkah untuk permintaan izin tidak diketahui.",
    );
  }

  const db = state.db ?? getDb();

  try {
    db.prepare(
      "INSERT INTO permission_log (step_id, request_summary, decision, decided_at) VALUES (?, ?, ?, ?)",
    ).run(
      state.stepId,
      redactText(permission.summary),
      decisionLabel,
      permission.decidedAt ?? new Date().toISOString(),
    );
  } catch (error) {
    throw new PermissionError(
      "log-failed",
      `Keputusan izin gagal dicatat: ${errorMessage(error)}`,
    );
  }
}

function completePermission(
  state: StreamState,
  pending: PendingPermission,
  updated: PermissionRecord,
  decision: AcpPermissionDecision,
): void {
  state.pendingPermissions.delete(updated.id);
  emitPermission(state, updated);
  pending.resolve(decision);
}

function expirePendingPermissions(state: StreamState): void {
  for (const [id, pending] of state.pendingPermissions) {
    const updated: PermissionRecord = {
      ...pending.record,
      status: "expired",
      decidedAt: new Date().toISOString(),
      error: "Sesi berakhir sebelum keputusan diberikan.",
    };

    state.pendingPermissions.delete(id);
    emitPermission(state, updated);
    pending.resolve({ outcome: "cancelled" });
  }
}

function autoPermissionDecision(
  state: StreamState,
  record: PermissionRecord,
): AcpPermissionDecision {
  const { allow, reject } = selectPermissionOptions(record.options);
  const decidedAt = new Date().toISOString();

  if (!allow) {
    emitPermission(state, {
      ...record,
      status: "failed",
      decidedAt,
      error: "Agen tidak menawarkan opsi persetujuan.",
    });

    return reject
      ? { outcome: "selected", optionId: reject.optionId }
      : { outcome: "cancelled" };
  }

  const updated: PermissionRecord = {
    ...record,
    status: "approved",
    decision: "approved",
    decisionSource: "auto",
    decidedAt,
  };

  try {
    persistPermissionDecision(state, updated, "approved_auto");
  } catch (error) {
    emitPermission(state, {
      ...updated,
      status: "failed",
      error: errorMessage(error),
    });

    return reject
      ? { outcome: "selected", optionId: reject.optionId }
      : { outcome: "cancelled" };
  }

  emitPermission(state, updated);

  return { outcome: "selected", optionId: allow.optionId };
}

function requestPermission(
  state: StreamState,
  request: AcpPermissionRequest,
): Promise<AcpPermissionDecision> {
  if (state.terminal) {
    return Promise.resolve({ outcome: "cancelled" });
  }

  const record = createPermissionRecord(state, request);

  if (state.autoApprovePermissions) {
    return Promise.resolve(autoPermissionDecision(state, record));
  }

  return new Promise<AcpPermissionDecision>((resolve) => {
    state.pendingPermissions.set(record.id, { record, resolve });
    emitPermission(state, record);
  });
}

export async function decidePermission(
  permissionId: string,
  decision: "approve" | "reject",
): Promise<PermissionRecord> {
  if (decision !== "approve" && decision !== "reject") {
    throw new PermissionError(
      "invalid-decision",
      "Keputusan harus approve atau reject.",
    );
  }

  const streams = getStreamsState();
  let state: StreamState | null = null;
  let pending: PendingPermission | null = null;

  for (const candidate of streams.streams.values()) {
    const entry = candidate.pendingPermissions.get(permissionId);
    if (entry) {
      state = candidate;
      pending = entry;
      break;
    }
  }

  if (!state || !pending) {
    throw new PermissionError(
      "not-found",
      "Permintaan izin tidak ditemukan atau sudah diputuskan.",
    );
  }

  if (state.terminal) {
    state.pendingPermissions.delete(permissionId);
    throw new PermissionError(
      "not-pending",
      "Sesi sudah berakhir; izin tidak dapat diputuskan.",
    );
  }

  const { allow, reject } = selectPermissionOptions(
    pending.record.options,
  );
  const approved = decision === "approve";
  const decidedAt = new Date().toISOString();

  if (approved && !allow) {
    const updated: PermissionRecord = {
      ...pending.record,
      status: "failed",
      decidedAt,
      error: "Agen tidak menawarkan opsi persetujuan.",
    };
    completePermission(
      state,
      pending,
      updated,
      reject
        ? { outcome: "selected", optionId: reject.optionId }
        : { outcome: "cancelled" },
    );
    throw new PermissionError(
      "not-pending",
      "Agen tidak menawarkan opsi persetujuan.",
    );
  }

  const updated: PermissionRecord = {
    ...pending.record,
    status: approved ? "approved" : "rejected",
    decision: approved ? "approved" : "rejected",
    decisionSource: "manual",
    decidedAt,
  };
  const decisionLabel = approved ? "approved" : "rejected";
  const outcome: AcpPermissionDecision = approved
    ? { outcome: "selected", optionId: allow!.optionId }
    : reject
      ? { outcome: "selected", optionId: reject.optionId }
      : { outcome: "cancelled" };

  try {
    persistPermissionDecision(state, updated, decisionLabel);
  } catch (error) {
    const failed: PermissionRecord = {
      ...updated,
      status: "failed",
      error: errorMessage(error),
    };
    completePermission(
      state,
      pending,
      failed,
      reject
        ? { outcome: "selected", optionId: reject.optionId }
        : { outcome: "cancelled" },
    );
    throw error;
  }

  completePermission(state, pending, updated, outcome);

  return updated;
}

export function setAutoApprovePermissions(
  episodeSlug: string,
  kind: StepKind,
  enabled: boolean,
): { attemptId: string; enabled: boolean } {
  if (typeof enabled !== "boolean") {
    throw new PermissionError(
      "invalid-decision",
      "Nilai mode otomatis harus boolean.",
    );
  }

  const state = getStreamsState().streams.get(
    streamKey(episodeSlug, kind),
  );

  if (!state || state.terminal) {
    throw new PermissionError(
      "no-active-session",
      "Tidak ada sesi aktif untuk langkah ini.",
    );
  }

  state.autoApprovePermissions = enabled;
  emitPermissionMode(state, enabled);

  return { attemptId: state.attemptId, enabled };
}

function terminalEventOf(
  events: AgentStreamEvent[],
): AgentStreamEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "status" && event.status !== "running") {
      return event;
    }
  }

  return null;
}

function latestPermissionRecords(
  events: AgentStreamEvent[],
): PermissionRecord[] {
  const records = new Map<string, PermissionRecord>();

  for (const event of events) {
    if (event.type === "permission") {
      records.set(event.permission.id, event.permission);
    }
  }

  return Array.from(records.values());
}

function replayEvents(
  events: AgentStreamEvent[],
  attemptId: string | null,
  afterSeq: number,
  terminalEvent: AgentStreamEvent | null,
): AgentStreamEvent[] {
  const sameAttempt = attemptId !== null;

  return events.filter((event) => {
    if (terminalEvent && event === terminalEvent) return true;
    if (!sameAttempt) return true;
    return event.seq > afterSeq;
  });
}

function validateStartOptions(
  options: StartStepStreamOptions,
): void {
  if (!options.episodeSlug || typeof options.episodeSlug !== "string") {
    throw new AgentStreamError(
      "invalid-request",
      "Slug episode wajib diisi.",
    );
  }

  if (!isStepKind(options.kind)) {
    throw new AgentStreamError(
      "invalid-kind",
      `Jenis langkah tidak dikenal: ${String(options.kind)}.`,
    );
  }

  if (!options.agentId || typeof options.agentId !== "string") {
    throw new AgentStreamError(
      "invalid-request",
      "ID agen wajib diisi.",
    );
  }

  if (
    typeof options.prompt !== "string" ||
    !options.prompt.trim() ||
    options.prompt.length > 100000
  ) {
    throw new AgentStreamError(
      "invalid-request",
      "Prompt wajib diisi dan maksimal 100000 karakter.",
    );
  }
}

function validateEpisodeDirectory(
  workspaceRoot: string,
  episodeSlug: string,
): void {
  const resolution = resolveWorkspacePath({
    workspaceRoot,
    area: "episode",
    episodeSlug,
    fileName: "episode.json",
  });

  if (!resolution.ok) {
    throw new AgentStreamError(
      "invalid-request",
      `Folder episode tidak aman (${resolution.reason}).`,
    );
  }

  const episodeDirectory = path.dirname(resolution.path);

  try {
    if (!fs.statSync(episodeDirectory).isDirectory()) {
      throw new AgentStreamError(
        "invalid-request",
        "Folder episode tidak ditemukan.",
      );
    }
  } catch (error) {
    if (error instanceof AgentStreamError) throw error;

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      throw new AgentStreamError(
        "invalid-request",
        "Folder episode tidak ditemukan.",
      );
    }

    throw error;
  }
}

export async function startStepStream(
  options: StartStepStreamOptions,
): Promise<StepStreamInfo> {
  validateStartOptions(options);

  const workspaceRoot = resolveWorkspaceDir(options.workspaceRoot);
  validateEpisodeDirectory(workspaceRoot, options.episodeSlug);

  const key = streamKey(options.episodeSlug, options.kind);
  const state = getStreamsState();
  const existing = state.streams.get(key);

  if (existing && !existing.terminal) {
    throw new AgentStreamError(
      "already-running",
      "Masih ada sesi aktif untuk langkah ini.",
    );
  }

  const logPath = getStepLogPath(
    workspaceRoot,
    options.episodeSlug,
    options.kind,
  );
  const attemptId = randomUUID();
  const stream: StreamState = {
    attemptId,
    episodeSlug: options.episodeSlug,
    kind: options.kind,
    agentId: options.agentId,
    status: "running",
    events: [],
    seq: 0,
    subscribers: new Set(),
    acp: null,
    logPath,
    terminal: false,
    stepId: options.stepId ?? null,
    db: options.db ?? null,
    autoApprovePermissions: false,
    pendingPermissions: new Map(),
  };

  state.streams.set(key, stream);

  emitPrompt(stream, options.prompt);
  emitStatus(stream, "running");

  const acp = new AcpSession({
    sessionId: attemptId,
    agentId: options.agentId,
    episodeSlug: options.episodeSlug,
    workspaceRoot,
    onUpdate: (update) => emitUpdate(stream, update),
    workingDirectory: options.workingDirectory,
    onPermissionRequest: (request) =>
      requestPermission(stream, request),
  });

  stream.acp = acp;

  try {
    await acp.start();
    await acp.configure({ modelId: options.modelId, effort: options.effort });
  } catch (error) {
    options.onFailure?.(errorMessage(error));
    emitStatus(stream, "failed", { error: errorMessage(error) });
    stream.acp = null;
    await acp.close();
    options.onSettled?.();
    throw new AgentStreamError("start-failed", errorMessage(error));
  }

  void (async () => {
    try {
      const result = await acp.prompt(options.prompt);
      if (stream.terminal) return;
      if (result.stopReason !== "end_turn") throw new Error(`Agen belum menyelesaikan pekerjaan (${result.stopReason}).`);
      await options.onComplete?.();
      if (stream.terminal) return;
      emitStatus(stream, "completed", {
        stopReason: result.stopReason,
      });
    } catch (error) {
      if (!stream.terminal) {
        options.onFailure?.(errorMessage(error));
        emitStatus(stream, "failed", { error: errorMessage(error) });
      }
    } finally {
      stream.acp = null;
      await acp.close();
      options.onSettled?.();
    }
  })();

  return {
    attemptId,
    episodeSlug: options.episodeSlug,
    kind: options.kind,
    agentId: options.agentId,
    status: "running",
  };
}

export function subscribeStepStream(options: {
  episodeSlug: string;
  kind: StepKind;
  workspaceRoot?: string;
  afterAttemptId?: string | null;
  afterSeq?: number;
  onEvent: Subscriber;
}): StepStreamSubscription {
  const workspaceRoot = resolveWorkspaceDir(options.workspaceRoot);
  const key = streamKey(options.episodeSlug, options.kind);
  const state = getStreamsState();
  const active = state.streams.get(key);
  const afterSeq = Number.isInteger(options.afterSeq)
    ? (options.afterSeq as number)
    : 0;

  if (active) {
    const terminal = terminalEventOf(active.events);
    const sameAttempt = options.afterAttemptId === active.attemptId;
    const replay = replayEvents(
      active.events,
      sameAttempt ? active.attemptId : null,
      sameAttempt ? afterSeq : 0,
      terminal,
    );

    let unsubscribe = () => {};

    if (!active.terminal) {
      active.subscribers.add(options.onEvent);
      unsubscribe = () => {
        active.subscribers.delete(options.onEvent);
      };
    }

    return {
      attemptId: active.attemptId,
      replay,
      terminal: active.terminal,
      unsubscribe,
    };
  }

  const logPath = getStepLogPath(
    workspaceRoot,
    options.episodeSlug,
    options.kind,
  );
  const history = readLatestAttempt(logPath);

  if (!history.attemptId) {
    const idle: AgentStreamEvent = {
      seq: 0,
      attemptId: "",
      type: "status",
      status: "idle",
      at: new Date().toISOString(),
    };

    return {
      attemptId: null,
      replay: [idle],
      terminal: true,
      unsubscribe: () => {},
    };
  }

  let events = history.events;
  let terminal = terminalEventOf(events);

  if (!terminal) {
    let nextSeq = events[events.length - 1]?.seq ?? 0;
    const now = new Date().toISOString();

    for (const permission of latestPermissionRecords(events)) {
      if (permission.status !== "pending") continue;

      nextSeq += 1;
      events = [
        ...events,
        {
          seq: nextSeq,
          attemptId: history.attemptId,
          type: "permission",
          permission: {
            ...permission,
            status: "expired",
            decidedAt: now,
            error:
              "Sesi tidak aktif. Izin tidak dapat diputuskan lagi.",
          },
          at: now,
        },
      ];
    }

    nextSeq += 1;
    const failed: AgentStreamEvent = {
      seq: nextSeq,
      attemptId: history.attemptId,
      type: "status",
      status: "failed",
      at: now,
      error:
        "Sesi tidak aktif. Server mungkin sudah dimulai ulang; prompt tidak dikirim ulang.",
    };
    events = [...events, failed];
    terminal = failed;
  }

  const sameAttempt = options.afterAttemptId === history.attemptId;
  const replay = replayEvents(
    events,
    sameAttempt ? history.attemptId : null,
    sameAttempt ? afterSeq : 0,
    terminal,
  );

  return {
    attemptId: history.attemptId,
    replay,
    terminal: true,
    unsubscribe: () => {},
  };
}

export function getStepStreamInfo(
  episodeSlug: string,
  kind: StepKind,
): { attemptId: string; status: AgentStreamStatus } | null {
  const stream = getStreamsState().streams.get(
    streamKey(episodeSlug, kind),
  );

  return stream
    ? { attemptId: stream.attemptId, status: stream.status }
    : null;
}

export async function resetAgentStreamsForTests(): Promise<void> {
  const state = getStreamsState();
  const closers = Array.from(state.streams.values()).map((stream) =>
    stream.acp?.close().catch(() => {}),
  );

  await Promise.all(closers);
  stopAllAgentSessions({ force: true });
  state.streams.clear();
}

export async function cancelStepStream(episodeSlug: string, kind: StepKind): Promise<void> {
  const stream = getStreamsState().streams.get(streamKey(episodeSlug, kind));
  if (!stream || stream.terminal) return;
  const acp = stream.acp;
  emitStatus(stream, "failed", { error: "Sesi dibatalkan pengguna." });
  acp?.cancel();
  await acp?.close();
  stream.acp = null;
}
