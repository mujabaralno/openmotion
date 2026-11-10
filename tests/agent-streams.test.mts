import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getStepStreamInfo,
  resetAgentStreamsForTests,
  startStepStream,
  subscribeStepStream,
} from "../src/server/agent-streams/manager.ts";
import type { AgentStreamEvent } from "../src/server/agent-streams/types.ts";
import { AgentStreamError } from "../src/server/agent-streams/errors.ts";
import {
  getStepLogPath,
  readLatestAttempt,
} from "../src/server/agent-streams/history.ts";
import {
  listAgentSessions,
  resetAgentRegistryForTests,
  stopAllAgentSessions,
} from "../src/server/agents/registry.ts";
import type { StepKind } from "../src/server/db/index.ts";

const mockPath = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "mock-acp-agent.mjs",
);

type Workspace = {
  root: string;
  workspaceRoot: string;
  episodeSlug: string;
  episodeDir: string;
};

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function isTerminal(event: AgentStreamEvent): boolean {
  return event.type === "status" && event.status !== "running";
}

function createWorkspace(): Workspace {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-streams-"));
  const workspaceRoot = path.join(root, "workspace");
  const episodeSlug = "episode-a";

  for (const slug of [episodeSlug, "episode-b"]) {
    const episodeDir = path.join(workspaceRoot, "episodes", slug);
    fs.mkdirSync(episodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(episodeDir, "episode.json"),
      JSON.stringify({ slug }),
      "utf8",
    );
  }

  const mock = (scenario: string, delayMs: number) => [
    mockPath,
    "--scenario",
    scenario,
    "--delay-ms",
    String(delayMs),
  ];

  fs.writeFileSync(
    path.join(workspaceRoot, "agents.json"),
    JSON.stringify({
      agents: [
        {
          id: "mock-stream",
          name: "Mock Stream",
          command: process.execPath,
          args: mock("stream", 20),
        },
        {
          id: "mock-slow",
          name: "Mock Slow",
          command: process.execPath,
          args: mock("stream", 100),
        },
        {
          id: "mock-permission",
          name: "Mock Permission",
          command: process.execPath,
          args: mock("permission", 20),
        },
      ],
    }),
    "utf8",
  );

  return {
    root,
    workspaceRoot,
    episodeSlug,
    episodeDir: path.join(workspaceRoot, "episodes", episodeSlug),
  };
}

async function withWorkspace(
  run: (workspace: Workspace) => Promise<void>,
) {
  await resetAgentStreamsForTests();
  resetAgentRegistryForTests();
  const workspace = createWorkspace();

  try {
    await run(workspace);
  } finally {
    await resetAgentStreamsForTests();
    stopAllAgentSessions({ force: true });
    resetAgentRegistryForTests();
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
}

function collectStepStream(
  workspace: Workspace,
  kind: StepKind,
  episodeSlug = workspace.episodeSlug,
): Promise<AgentStreamEvent[]> {
  return new Promise((resolve, reject) => {
    const events: AgentStreamEvent[] = [];
    let unsubscribe = () => {};
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      unsubscribe();
      resolve(events);
    };

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      unsubscribe();
      reject(new Error("Timeout menunggu stream selesai."));
    }, 10000);

    const complete = () => {
      clearTimeout(timer);
      finish();
    };

    try {
      const subscription = subscribeStepStream({
        episodeSlug,
        kind,
        workspaceRoot: workspace.workspaceRoot,
        onEvent: (event) => {
          events.push(event);
          if (isTerminal(event)) complete();
        },
      });

      unsubscribe = subscription.unsubscribe;
      events.push(...subscription.replay);

      if (subscription.terminal) {
        complete();
      }
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

function eventKeys(events: AgentStreamEvent[]): string[] {
  return events.map(
    (event) =>
      `${event.attemptId}:${event.seq}:${event.type}:${event.type === "status" ? event.status : ""}`,
  );
}

async function waitForSessionStopped(attemptId: string): Promise<void> {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const session = listAgentSessions().find(
      (candidate) => candidate.sessionId === attemptId,
    );

    if (session?.status === "stopped" || session?.status === "exited") {
      return;
    }

    await delay(25);
  }

  throw new Error(`Sesi ${attemptId} belum berhenti.`);
}

test("streaming menghubungkan prompt, update bertahap, dan status selesai", async () => {
  await withWorkspace(async (workspace) => {
    const attempt = await startStepStream({
      episodeSlug: workspace.episodeSlug,
      kind: "script",
      agentId: "mock-stream",
      prompt: "Halo stream",
      workspaceRoot: workspace.workspaceRoot,
    });

    assert.match(attempt.attemptId, /^[0-9a-f-]{36}$/);

    const events = await collectStepStream(workspace, "script");
    const statuses = events.filter((event) => event.type === "status");
    const updates = events.filter((event) => event.type === "update");
    const lastStatus = statuses.at(-1);

    assert.equal(events[0]?.type, "prompt");
    assert.equal(
      events.some(
        (event) => event.type === "status" && event.status === "running",
      ),
      true,
    );
    assert.equal(
      lastStatus?.type === "status" ? lastStatus.status : null,
      "completed",
    );
    assert.ok(
      updates.filter(
        (event) =>
          event.type === "update" &&
          event.update.sessionUpdate === "agent_message_chunk",
      ).length >= 3,
    );
    assert.deepEqual(
      events.map((event) => event.seq),
      events.map((_, index) => index + 1),
    );
    assert.equal(
      events.every((event) => event.attemptId === attempt.attemptId),
      true,
    );
    assert.equal(
      getStepStreamInfo(workspace.episodeSlug, "script")?.status,
      "completed",
    );

    const logPath = getStepLogPath(
      workspace.workspaceRoot,
      workspace.episodeSlug,
      "script",
    );
    assert.equal(fs.existsSync(logPath), true);
    assert.equal(fs.statSync(logPath).mode & 0o777, 0o600);

    const history = readLatestAttempt(logPath);
    assert.equal(history.attemptId, attempt.attemptId);
    assert.deepEqual(history.events, events);

    await waitForSessionStopped(attempt.attemptId);
    const sessions = listAgentSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.status, "stopped");
  });
});

test("reconnect memulihkan update yang terlewat tanpa duplikasi", async () => {
  await withWorkspace(async (workspace) => {
    const attempt = await startStepStream({
      episodeSlug: workspace.episodeSlug,
      kind: "script",
      agentId: "mock-slow",
      prompt: "Halo reconnect",
      workspaceRoot: workspace.workspaceRoot,
    });

    const firstEvents: AgentStreamEvent[] = [];
    let lastSeen: AgentStreamEvent | null = null;
    let unsubscribe = () => {};

    await new Promise<void>((resolve) => {
      const subscription = subscribeStepStream({
        episodeSlug: workspace.episodeSlug,
        kind: "script",
        workspaceRoot: workspace.workspaceRoot,
        onEvent: (event) => {
          firstEvents.push(event);
          lastSeen = event;
          if (
            event.type === "update" &&
            event.update.sessionUpdate === "agent_message_chunk"
          ) {
            unsubscribe();
            resolve();
          }
        },
      });

      unsubscribe = subscription.unsubscribe;
      firstEvents.push(...subscription.replay);
      for (const event of subscription.replay) {
        lastSeen = event;
      }

      if (
        subscription.replay.some(
          (event) =>
            event.type === "update" &&
            event.update.sessionUpdate === "agent_message_chunk",
        )
      ) {
        unsubscribe();
        resolve();
      }
    });

    const resumeEvent = lastSeen as AgentStreamEvent | null;
    assert.ok(resumeEvent);
    assert.equal(attempt.attemptId, resumeEvent.attemptId);

    const deadline = Date.now() + 5000;
    while (
      getStepStreamInfo(workspace.episodeSlug, "script")?.status !==
        "completed" &&
      Date.now() < deadline
    ) {
      await delay(25);
    }

    const replayed: AgentStreamEvent[] = [];
    const subscription = subscribeStepStream({
      episodeSlug: workspace.episodeSlug,
      kind: "script",
      workspaceRoot: workspace.workspaceRoot,
      afterAttemptId: resumeEvent.attemptId,
      afterSeq: resumeEvent.seq,
      onEvent: (event) => replayed.push(event),
    });
    replayed.push(...subscription.replay);
    subscription.unsubscribe();

    assert.equal(subscription.terminal, true);
    assert.equal(replayed.length > 0, true);
    assert.equal(
      replayed.every((event) => event.seq > resumeEvent.seq),
      true,
    );

    const combined = [...firstEvents, ...replayed];
    const keys = combined.map(
      (event) => `${event.attemptId}:${event.seq}`,
    );
    assert.equal(new Set(keys).size, keys.length);

    const maxSeq = Math.max(...combined.map((event) => event.seq));
    for (let seq = 1; seq <= maxSeq; seq += 1) {
      assert.equal(
        keys.includes(`${resumeEvent.attemptId}:${seq}`),
        true,
        `event seq ${seq} hilang`,
      );
    }
  });
});

test("refresh membaca riwayat tanpa memulai agen baru", async () => {
  await withWorkspace(async (workspace) => {
    const attempt = await startStepStream({
      episodeSlug: workspace.episodeSlug,
      kind: "script",
      agentId: "mock-stream",
      prompt: "Halo refresh",
      workspaceRoot: workspace.workspaceRoot,
    });
    await collectStepStream(workspace, "script");

    const sessionsBefore = listAgentSessions().length;
    const replayed: AgentStreamEvent[] = [];
    const subscription = subscribeStepStream({
      episodeSlug: workspace.episodeSlug,
      kind: "script",
      workspaceRoot: workspace.workspaceRoot,
      onEvent: (event) => replayed.push(event),
    });
    replayed.push(...subscription.replay);
    subscription.unsubscribe();

    assert.equal(subscription.attemptId, attempt.attemptId);
    assert.equal(subscription.terminal, true);
    assert.equal(replayed[0]?.type, "prompt");
    assert.equal(
      replayed.some(
        (event) => event.type === "status" && event.status === "completed",
      ),
      true,
    );
    assert.equal(listAgentSessions().length, sessionsBefore);
  });
});

test("langkah dan episode berbeda menyimpan stream terpisah", async () => {
  await withWorkspace(async (workspace) => {
    const script = await startStepStream({
      episodeSlug: workspace.episodeSlug,
      kind: "script",
      agentId: "mock-stream",
      prompt: "Prompt script",
      workspaceRoot: workspace.workspaceRoot,
    });
    const tags = await startStepStream({
      episodeSlug: workspace.episodeSlug,
      kind: "tags",
      agentId: "mock-stream",
      prompt: "Prompt tags",
      workspaceRoot: workspace.workspaceRoot,
    });

    const scriptEvents = await collectStepStream(workspace, "script");
    const tagsEvents = await collectStepStream(workspace, "tags");

    assert.notEqual(script.attemptId, tags.attemptId);
    assert.equal(
      scriptEvents.every(
        (event) => event.attemptId === script.attemptId,
      ),
      true,
    );
    assert.equal(
      tagsEvents.every((event) => event.attemptId === tags.attemptId),
      true,
    );

    const scriptHistory = readLatestAttempt(
      getStepLogPath(
        workspace.workspaceRoot,
        workspace.episodeSlug,
        "script",
      ),
    );
    const tagsHistory = readLatestAttempt(
      getStepLogPath(
        workspace.workspaceRoot,
        workspace.episodeSlug,
        "tags",
      ),
    );

    assert.equal(scriptHistory.attemptId, script.attemptId);
    assert.equal(tagsHistory.attemptId, tags.attemptId);
  });
});

test("permintaan izin tidak disetujui otomatis saat streaming", async () => {
  await withWorkspace(async (workspace) => {
    await startStepStream({
      episodeSlug: workspace.episodeSlug,
      kind: "script",
      agentId: "mock-permission",
      prompt: "Tulis berkas uji",
      workspaceRoot: workspace.workspaceRoot,
    });
    const events = await collectStepStream(workspace, "script");

    assert.equal(
      fs.existsSync(path.join(workspace.episodeDir, "mock-output.txt")),
      false,
    );
    assert.equal(
      events.some(
        (event) =>
          event.type === "update" &&
          event.update.sessionUpdate === "tool_call_update" &&
          event.update.status === "failed",
      ),
      true,
    );
    assert.equal(
      events.some(
        (event) => event.type === "status" && event.status === "completed",
      ),
      true,
    );
  });
});

test("input tidak valid dan sesi aktif ganda ditolak", async () => {
  await withWorkspace(async (workspace) => {
    await assert.rejects(
      () =>
        startStepStream({
          episodeSlug: workspace.episodeSlug,
          kind: "chat" as StepKind,
          agentId: "mock-stream",
          prompt: "Halo",
          workspaceRoot: workspace.workspaceRoot,
        }),
      (error) =>
        error instanceof AgentStreamError && error.code === "invalid-kind",
    );

    await assert.rejects(
      () =>
        startStepStream({
          episodeSlug: workspace.episodeSlug,
          kind: "script",
          agentId: "mock-stream",
          prompt: "   ",
          workspaceRoot: workspace.workspaceRoot,
        }),
      (error) =>
        error instanceof AgentStreamError && error.code === "invalid-request",
    );

    await assert.rejects(
      () =>
        startStepStream({
          episodeSlug: "tidak-ada",
          kind: "script",
          agentId: "mock-stream",
          prompt: "Halo",
          workspaceRoot: workspace.workspaceRoot,
        }),
      (error) =>
        error instanceof AgentStreamError && error.code === "invalid-request",
    );

    await startStepStream({
      episodeSlug: workspace.episodeSlug,
      kind: "script",
      agentId: "mock-slow",
      prompt: "Halo",
      workspaceRoot: workspace.workspaceRoot,
    });

    await assert.rejects(
      () =>
        startStepStream({
          episodeSlug: workspace.episodeSlug,
          kind: "script",
          agentId: "mock-slow",
          prompt: "Halo lagi",
          workspaceRoot: workspace.workspaceRoot,
        }),
      (error) =>
        error instanceof AgentStreamError &&
        error.code === "already-running",
    );

    await collectStepStream(workspace, "script");
  });
});

test("event keys mempertahankan urutan untuk deduplikasi UI", () => {
  const events: AgentStreamEvent[] = [
    {
      seq: 1,
      attemptId: "a",
      type: "prompt",
      text: "x",
      at: "2026-01-01T00:00:00.000Z",
    },
    {
      seq: 2,
      attemptId: "a",
      type: "status",
      status: "completed",
      at: "2026-01-01T00:00:01.000Z",
    },
  ];

  assert.deepEqual(eventKeys(events), [
    "a:1:prompt:",
    "a:2:status:completed",
  ]);
});
