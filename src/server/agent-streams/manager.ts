import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AcpSession } from "../acp/client.ts";
import type { AcpUpdate } from "../acp/types.ts";
import {
  STEP_KINDS,
  type StepKind,
} from "../db/index.ts";
import {
  resolveWorkspaceDir,
} from "../workspace/init.ts";
import { resolveWorkspacePath } from "../workspace/paths.ts";
import { stopAllAgentSessions } from "../agents/registry.ts";
import { AgentStreamError } from "./errors.ts";
import {
  appendStepEvent,
  getStepLogPath,
  readLatestAttempt,
} from "./history.ts";
import type {
  AgentStreamEvent,
  AgentStreamStatus,
} from "./types.ts";

export type StartStepStreamOptions = {
  episodeSlug: string;
  kind: StepKind;
  agentId: string;
  prompt: string;
  workspaceRoot?: string;
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
    options.prompt.length > 20000
  ) {
    throw new AgentStreamError(
      "invalid-request",
      "Prompt wajib diisi dan maksimal 20000 karakter.",
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
  });

  stream.acp = acp;

  try {
    await acp.start();
  } catch (error) {
    emitStatus(stream, "failed", { error: errorMessage(error) });
    stream.acp = null;
    await acp.close();
    throw new AgentStreamError("start-failed", errorMessage(error));
  }

  void (async () => {
    try {
      const result = await acp.prompt(options.prompt);
      emitStatus(stream, "completed", {
        stopReason: result.stopReason,
      });
    } catch (error) {
      emitStatus(stream, "failed", { error: errorMessage(error) });
    } finally {
      stream.acp = null;
      await acp.close();
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
    const last = events[events.length - 1];
    const failed: AgentStreamEvent = {
      seq: (last?.seq ?? 0) + 1,
      attemptId: history.attemptId,
      type: "status",
      status: "failed",
      at: new Date().toISOString(),
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
