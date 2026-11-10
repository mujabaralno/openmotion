import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type Database from "better-sqlite3";
import {
  decidePermission,
  getStepStreamInfo,
  resetAgentStreamsForTests,
  setAutoApprovePermissions,
  startStepStream,
  subscribeStepStream,
} from "../src/server/agent-streams/manager.ts";
import type {
  AgentStreamEvent,
  PermissionRecord,
} from "../src/server/agent-streams/types.ts";
import {
  AgentStreamError,
  PermissionError,
} from "../src/server/agent-streams/errors.ts";
import {
  getStepLogPath,
  readLatestAttempt,
} from "../src/server/agent-streams/history.ts";
import {
  listAgentSessions,
  resetAgentRegistryForTests,
  stopAllAgentSessions,
} from "../src/server/agents/registry.ts";
import {
  createDatabase,
  STEP_KINDS,
  type StepKind,
} from "../src/server/db/index.ts";

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
          args: mock("permission", 100),
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

function createPermissionDatabase(workspace: Workspace): {
  db: Database.Database;
  stepIds: Record<StepKind, number>;
} {
  const db = createDatabase(
    path.join(workspace.root, "data", "app.db"),
  );
  const episode = db
    .prepare(
      "INSERT INTO episodes (slug, title, topic) VALUES (?, ?, ?)",
    )
    .run(workspace.episodeSlug, "Episode Uji", "");
  const stepIds = {} as Record<StepKind, number>;

  for (const kind of STEP_KINDS) {
    const result = db
      .prepare("INSERT INTO steps (episode_id, kind) VALUES (?, ?)")
      .run(episode.lastInsertRowid, kind);
    stepIds[kind] = Number(result.lastInsertRowid);
  }

  return { db, stepIds };
}

function openCollector(
  workspace: Workspace,
  kind: StepKind,
  episodeSlug = workspace.episodeSlug,
) {
  const events: AgentStreamEvent[] = [];
  const subscription = subscribeStepStream({
    episodeSlug,
    kind,
    workspaceRoot: workspace.workspaceRoot,
    onEvent: (event) => events.push(event),
  });
  events.push(...subscription.replay);

  return {
    events,
    subscription,
    close() {
      subscription.unsubscribe();
    },
    async waitFor(
      predicate: (event: AgentStreamEvent) => boolean,
      label: string,
      timeoutMs = 10000,
    ): Promise<AgentStreamEvent> {
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        const event = events.find(predicate);
        if (event) return event;
        await delay(20);
      }

      throw new Error(`Timeout menunggu ${label}.`);
    },
  };
}

function latestPermission(
  events: AgentStreamEvent[],
  permissionId: string,
): PermissionRecord | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      event.type === "permission" &&
      event.permission.id === permissionId
    ) {
      return event.permission;
    }
  }

  return null;
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

test("izin manual menunggu, disetujui sekali, dan tercatat", async () => {
  await withWorkspace(async (workspace) => {
    const { db, stepIds } = createPermissionDatabase(workspace);

    try {
      const attempt = await startStepStream({
        episodeSlug: workspace.episodeSlug,
        kind: "script",
        agentId: "mock-permission",
        prompt: "Tulis berkas uji",
        workspaceRoot: workspace.workspaceRoot,
        stepId: stepIds.script,
        db,
      });
      const collector = openCollector(workspace, "script");

      try {
        const pendingEvent = await collector.waitFor(
          (event) =>
            event.type === "permission" &&
            event.permission.status === "pending",
          "izin pending",
        );

        assert.equal(pendingEvent.type, "permission");
        if (pendingEvent.type !== "permission") {
          assert.fail("Event izin tidak valid.");
        }

        const permission = pendingEvent.permission;
        assert.equal(
          fs.existsSync(
            path.join(workspace.episodeDir, "mock-output.txt"),
          ),
          false,
        );

        const decided = await decidePermission(
          permission.id,
          "approve",
        );

        assert.equal(decided.status, "approved");
        assert.equal(decided.decisionSource, "manual");
        assert.equal(decided.attemptId, attempt.attemptId);

        await collector.waitFor(
          (event) =>
            event.type === "status" && event.status === "completed",
          "status selesai",
        );

        const content = fs.readFileSync(
          path.join(workspace.episodeDir, "mock-output.txt"),
          "utf8",
        );

        assert.match(content, /^approved:mock-session-/);
        assert.match(content, /Tulis berkas uji/);

        const log = db
          .prepare(
            "SELECT step_id, request_summary, decision FROM permission_log",
          )
          .get() as {
          step_id: number;
          request_summary: string;
          decision: string;
        };

        assert.equal(log.step_id, stepIds.script);
        assert.equal(log.decision, "approved");
        assert.match(log.request_summary, /Menulis file contoh/);
        assert.equal(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM permission_log",
              )
              .get() as { count: number }
          ).count,
          1,
        );

        await assert.rejects(
          () => decidePermission(permission.id, "reject"),
          (error) =>
            error instanceof PermissionError &&
            (error.code === "not-found" || error.code === "not-pending"),
        );
      } finally {
        collector.close();
      }
    } finally {
      await resetAgentStreamsForTests();
      try {
        db.close();
      } catch {
        // Database sudah ditutup.
      }
    }
  });
});

test("penolakan manual tidak menulis file", async () => {
  await withWorkspace(async (workspace) => {
    const { db, stepIds } = createPermissionDatabase(workspace);

    try {
      await startStepStream({
        episodeSlug: workspace.episodeSlug,
        kind: "script",
        agentId: "mock-permission",
        prompt: "Tulis berkas uji",
        workspaceRoot: workspace.workspaceRoot,
        stepId: stepIds.script,
        db,
      });
      const collector = openCollector(workspace, "script");

      try {
        const pendingEvent = await collector.waitFor(
          (event) =>
            event.type === "permission" &&
            event.permission.status === "pending",
          "izin pending",
        );

        if (pendingEvent.type !== "permission") {
          assert.fail("Event izin tidak valid.");
        }

        await decidePermission(pendingEvent.permission.id, "reject");
        await collector.waitFor(
          (event) =>
            event.type === "status" && event.status === "completed",
          "status selesai",
        );

        assert.equal(
          fs.existsSync(
            path.join(workspace.episodeDir, "mock-output.txt"),
          ),
          false,
        );
        assert.equal(
          (
            db
              .prepare(
                "SELECT decision FROM permission_log",
              )
              .get() as { decision: string }
          ).decision,
          "rejected",
        );
      } finally {
        collector.close();
      }
    } finally {
      await resetAgentStreamsForTests();
      try {
        db.close();
      } catch {
        // Database sudah ditutup.
      }
    }
  });
});

test("mode otomatis menyetujui permintaan berikutnya dan mencatat approved_auto", async () => {
  await withWorkspace(async (workspace) => {
    const { db, stepIds } = createPermissionDatabase(workspace);

    try {
      await startStepStream({
        episodeSlug: workspace.episodeSlug,
        kind: "script",
        agentId: "mock-permission",
        prompt: "Tulis berkas uji",
        workspaceRoot: workspace.workspaceRoot,
        stepId: stepIds.script,
        db,
      });
      setAutoApprovePermissions(
        workspace.episodeSlug,
        "script",
        true,
      );
      const collector = openCollector(workspace, "script");

      try {
        const approvedEvent = await collector.waitFor(
          (event) =>
            event.type === "permission" &&
            event.permission.status === "approved",
          "izin auto-approved",
        );

        if (approvedEvent.type !== "permission") {
          assert.fail("Event izin tidak valid.");
        }

        assert.equal(approvedEvent.permission.auto, true);
        assert.equal(
          approvedEvent.permission.decisionSource,
          "auto",
        );

        await collector.waitFor(
          (event) =>
            event.type === "status" && event.status === "completed",
          "status selesai",
        );

        assert.equal(
          fs.existsSync(
            path.join(workspace.episodeDir, "mock-output.txt"),
          ),
          true,
        );
        assert.equal(
          (
            db
              .prepare(
                "SELECT decision FROM permission_log",
              )
              .get() as { decision: string }
          ).decision,
          "approved_auto",
        );
        assert.equal(
          collector.events.some(
            (event) =>
              event.type === "permission-mode" && event.enabled,
          ),
          true,
        );
      } finally {
        collector.close();
      }
    } finally {
      await resetAgentStreamsForTests();
      try {
        db.close();
      } catch {
        // Database sudah ditutup.
      }
    }
  });
});

test("permintaan yang sudah menunggu tetap manual saat mode otomatis dinyalakan", async () => {
  await withWorkspace(async (workspace) => {
    const { db, stepIds } = createPermissionDatabase(workspace);

    try {
      await startStepStream({
        episodeSlug: workspace.episodeSlug,
        kind: "script",
        agentId: "mock-permission",
        prompt: "Tulis berkas uji",
        workspaceRoot: workspace.workspaceRoot,
        stepId: stepIds.script,
        db,
      });
      const collector = openCollector(workspace, "script");

      try {
        const pendingEvent = await collector.waitFor(
          (event) =>
            event.type === "permission" &&
            event.permission.status === "pending",
          "izin pending",
        );

        if (pendingEvent.type !== "permission") {
          assert.fail("Event izin tidak valid.");
        }

        const permissionId = pendingEvent.permission.id;
        setAutoApprovePermissions(
          workspace.episodeSlug,
          "script",
          true,
        );
        await delay(300);

        assert.equal(
          latestPermission(collector.events, permissionId)?.status,
          "pending",
        );
        assert.equal(
          fs.existsSync(
            path.join(workspace.episodeDir, "mock-output.txt"),
          ),
          false,
        );

        await decidePermission(permissionId, "reject");
        await collector.waitFor(
          (event) =>
            event.type === "status" && event.status === "completed",
          "status selesai",
        );
        assert.equal(
          (
            db
              .prepare(
                "SELECT decision FROM permission_log",
              )
              .get() as { decision: string }
          ).decision,
          "rejected",
        );
      } finally {
        collector.close();
      }
    } finally {
      await resetAgentStreamsForTests();
      try {
        db.close();
      } catch {
        // Database sudah ditutup.
      }
    }
  });
});

test("keputusan tidak valid, ganda, dan kegagalan log tidak menyetujui tindakan", async () => {
  await withWorkspace(async (workspace) => {
    const { db, stepIds } = createPermissionDatabase(workspace);

    try {
      await startStepStream({
        episodeSlug: workspace.episodeSlug,
        kind: "script",
        agentId: "mock-permission",
        prompt: "Tulis berkas uji",
        workspaceRoot: workspace.workspaceRoot,
        stepId: stepIds.script,
        db,
      });
      const collector = openCollector(workspace, "script");

      try {
        const pendingEvent = await collector.waitFor(
          (event) =>
            event.type === "permission" &&
            event.permission.status === "pending",
          "izin pending",
        );

        if (pendingEvent.type !== "permission") {
          assert.fail("Event izin tidak valid.");
        }

        const permissionId = pendingEvent.permission.id;

        await assert.rejects(
          () => decidePermission("tidak-ada", "approve"),
          (error) =>
            error instanceof PermissionError &&
            error.code === "not-found",
        );
        await assert.rejects(
          () => decidePermission(permissionId, "maybe" as "approve"),
          (error) =>
            error instanceof PermissionError &&
            error.code === "invalid-decision",
        );

        db.close();
        await assert.rejects(
          () => decidePermission(permissionId, "approve"),
          (error) =>
            error instanceof PermissionError &&
            error.code === "log-failed",
        );

        await collector.waitFor(
          (event) =>
            event.type === "permission" &&
            event.permission.id === permissionId &&
            event.permission.status === "failed",
          "izin gagal dicatat",
        );
        assert.equal(
          fs.existsSync(
            path.join(workspace.episodeDir, "mock-output.txt"),
          ),
          false,
        );
      } finally {
        collector.close();
      }
    } finally {
      await resetAgentStreamsForTests();
      try {
        db.close();
      } catch {
        // Database sudah ditutup.
      }
    }
  });
});

test("mode otomatis tidak terbawa ke eksekusi baru atau langkah lain", async () => {
  await withWorkspace(async (workspace) => {
    const { db, stepIds } = createPermissionDatabase(workspace);

    try {
      await startStepStream({
        episodeSlug: workspace.episodeSlug,
        kind: "script",
        agentId: "mock-permission",
        prompt: "Tulis otomatis",
        workspaceRoot: workspace.workspaceRoot,
        stepId: stepIds.script,
        db,
      });
      setAutoApprovePermissions(
        workspace.episodeSlug,
        "script",
        true,
      );
      const autoCollector = openCollector(workspace, "script");
      await autoCollector.waitFor(
        (event) =>
          event.type === "permission" &&
          event.permission.status === "approved",
        "izin auto",
      );
      await autoCollector.waitFor(
        (event) =>
          event.type === "status" && event.status === "completed",
        "auto selesai",
      );
      autoCollector.close();

      await startStepStream({
        episodeSlug: workspace.episodeSlug,
        kind: "script",
        agentId: "mock-permission",
        prompt: "Tulis manual baru",
        workspaceRoot: workspace.workspaceRoot,
        stepId: stepIds.script,
        db,
      });
      const newExecution = openCollector(workspace, "script");
      const newPending = await newExecution.waitFor(
        (event) =>
          event.type === "permission" &&
          event.permission.status === "pending",
        "izin manual eksekusi baru",
      );

      if (newPending.type !== "permission") {
        assert.fail("Event izin tidak valid.");
      }

      assert.equal(newPending.permission.auto, false);
      await decidePermission(newPending.permission.id, "reject");
      await newExecution.waitFor(
        (event) =>
          event.type === "status" && event.status === "completed",
        "eksekusi baru selesai",
      );
      newExecution.close();

      await startStepStream({
        episodeSlug: workspace.episodeSlug,
        kind: "tags",
        agentId: "mock-permission",
        prompt: "Tulis langkah lain",
        workspaceRoot: workspace.workspaceRoot,
        stepId: stepIds.tags,
        db,
      });
      const otherStep = openCollector(workspace, "tags");
      const otherPending = await otherStep.waitFor(
        (event) =>
          event.type === "permission" &&
          event.permission.status === "pending",
        "izin langkah lain",
      );

      if (otherPending.type !== "permission") {
        assert.fail("Event izin tidak valid.");
      }

      assert.equal(otherPending.permission.auto, false);
      await decidePermission(otherPending.permission.id, "reject");
      await otherStep.waitFor(
        (event) =>
          event.type === "status" && event.status === "completed",
        "langkah lain selesai",
      );
      otherStep.close();
    } finally {
      await resetAgentStreamsForTests();
      try {
        db.close();
      } catch {
        // Database sudah ditutup.
      }
    }
  });
});

test("izin pending dari sesi yang berakhir tidak dapat disetujui setelah refresh", async () => {
  await withWorkspace(async (workspace) => {
    const { db, stepIds } = createPermissionDatabase(workspace);

    try {
      await startStepStream({
        episodeSlug: workspace.episodeSlug,
        kind: "script",
        agentId: "mock-permission",
        prompt: "Tulis berkas uji",
        workspaceRoot: workspace.workspaceRoot,
        stepId: stepIds.script,
        db,
      });
      const collector = openCollector(workspace, "script");
      const pendingEvent = await collector.waitFor(
        (event) =>
          event.type === "permission" &&
          event.permission.status === "pending",
        "izin pending",
      );

      if (pendingEvent.type !== "permission") {
        assert.fail("Event izin tidak valid.");
      }

      const permissionId = pendingEvent.permission.id;
      collector.close();
      await resetAgentStreamsForTests();

      await assert.rejects(
        () => decidePermission(permissionId, "approve"),
        (error) =>
          error instanceof PermissionError &&
          error.code === "not-found",
      );

      const replay: AgentStreamEvent[] = [];
      const subscription = subscribeStepStream({
        episodeSlug: workspace.episodeSlug,
        kind: "script",
        workspaceRoot: workspace.workspaceRoot,
        onEvent: (event) => replay.push(event),
      });
      replay.push(...subscription.replay);
      subscription.unsubscribe();

      assert.equal(
        replay.some(
          (event) =>
            event.type === "permission" &&
            event.permission.id === permissionId &&
            event.permission.status === "expired",
        ),
        true,
      );
      assert.equal(
        replay.some(
          (event) =>
            event.type === "status" && event.status === "failed",
        ),
        true,
      );
      assert.equal(
        fs.existsSync(
          path.join(workspace.episodeDir, "mock-output.txt"),
        ),
        false,
      );
    } finally {
      await resetAgentStreamsForTests();
      try {
        db.close();
      } catch {
        // Database sudah ditutup.
      }
    }
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
