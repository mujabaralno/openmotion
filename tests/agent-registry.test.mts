import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AGENT_REGISTRY_GLOBAL_KEY,
  AgentSessionError,
  getAgentSession,
  listAgentSessions,
  resetAgentRegistryForTests,
  startAgentSession,
  stopAgentSession,
  stopAllAgentSessions,
} from "../src/server/agents/registry.ts";

type FixtureOptions = {
  command?: string;
  args?: string[];
};

type Fixture = {
  root: string;
  workspaceRoot: string;
  episodeSlug: string;
  episodeDir: string;
  pidFile: string;
};

type PidInfo = {
  parent: number;
  grandchild: number;
  cwd: string;
};

type ReadyInfo = {
  agentPid?: number;
  cwd?: string;
  error?: string;
};

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isErrno(error, "ESRCH");
  }
}

function readJson<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function readPidInfo(filePath: string): PidInfo | undefined {
  return readJson<PidInfo>(filePath);
}

function readReady(filePath: string): ReadyInfo | undefined {
  return readJson<ReadyInfo>(filePath);
}

async function waitFor<T>(
  label: string,
  check: () => T | undefined,
  timeoutMs = 5000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = check();
    if (value !== undefined) return value;
    await delay(25);
  }

  throw new Error(`Timeout menunggu ${label}.`);
}

async function waitUntilDead(pid: number): Promise<void> {
  await waitFor(`proses ${pid} berhenti`, () =>
    isProcessAlive(pid) ? undefined : true,
  );
}

function createFixture(options: FixtureOptions = {}): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-registry-"));
  const workspaceRoot = path.join(root, "workspace");
  const episodeSlug = "episode-a";
  const episodeDir = path.join(
    workspaceRoot,
    "episodes",
    episodeSlug,
  );
  const pidFile = path.join(root, "pids.json");
  const stubPath = path.join(
    process.cwd(),
    "tests",
    "fixtures",
    "stub-agent.mjs",
  );

  fs.mkdirSync(episodeDir, { recursive: true });
  fs.writeFileSync(
    path.join(episodeDir, "episode.json"),
    JSON.stringify({ slug: episodeSlug }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "agents.json"),
    JSON.stringify({
      agents: [
        {
          id: "stub",
          name: "Stub Agent",
          command: options.command ?? process.execPath,
          args:
            options.args ??
            [stubPath, "--pid-file", pidFile],
        },
      ],
    }),
    "utf8",
  );

  return {
    root,
    workspaceRoot,
    episodeSlug,
    episodeDir,
    pidFile,
  };
}

function ensureEpisode(workspaceRoot: string, slug: string): string {
  const directory = path.join(workspaceRoot, "episodes", slug);

  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "episode.json"),
    JSON.stringify({ slug }),
    "utf8",
  );

  return directory;
}

async function withFixture(
  options: FixtureOptions,
  run: (fixture: Fixture) => Promise<void>,
) {
  resetAgentRegistryForTests();
  const fixture = createFixture(options);

  try {
    await run(fixture);
  } finally {
    stopAllAgentSessions({ force: true });
    await delay(100);
    resetAgentRegistryForTests();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

function startStub(
  fixture: Fixture,
  sessionId: string,
  episodeSlug = fixture.episodeSlug,
) {
  return startAgentSession({
    sessionId,
    agentId: "stub",
    episodeSlug,
    workspaceRoot: fixture.workspaceRoot,
  });
}

function expectSessionError(
  run: () => void,
  code: AgentSessionError["code"],
) {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof AgentSessionError);
    assert.equal(error.code, code);
    return;
  }

  assert.fail(`Diharapkan error ${code}, tetapi tidak ada error`);
}

test("menjalankan satu proses per sesi dan membersihkan process group", async () => {
  await withFixture({}, async (fixture) => {
    startStub(fixture, "session-1");

    const first = await waitFor("session-1 berjalan", () => {
      const session = getAgentSession("session-1");
      return session?.status === "running" ? session : undefined;
    });

    assert.ok(first.pid);

    const duplicate = startStub(fixture, "session-1");
    assert.equal(duplicate.pid, first.pid);
    assert.equal(listAgentSessions().length, 1);

    const pidInfo = await waitFor("pid file stub", () =>
      readPidInfo(fixture.pidFile),
    );

    assert.equal(pidInfo.parent, first.pid);
    assert.equal(
      fs.realpathSync(pidInfo.cwd),
      fs.realpathSync(fixture.episodeDir),
    );
    assert.ok(pidInfo.grandchild);

    startStub(fixture, "session-2");

    const second = await waitFor("session-2 berjalan", () => {
      const session = getAgentSession("session-2");
      return session?.status === "running" ? session : undefined;
    });

    assert.notEqual(second.pid, first.pid);
    assert.equal(listAgentSessions().length, 2);

    assert.equal(stopAllAgentSessions({ force: true }), 2);

    await waitUntilDead(first.pid);
    await waitUntilDead(second.pid as number);
    await waitUntilDead(pidInfo.grandchild);

    assert.equal(stopAllAgentSessions({ force: true }), 0);
    assert.equal(getAgentSession("session-1")?.status, "stopped");
  });
});

test("kegagalan memulai proses tercatat sebagai failed, bukan aktif", async () => {
  await withFixture(
    {
      command: path.join(
        os.tmpdir(),
        "agent-yang-tidak-ada",
        String(Date.now()),
      ),
    },
    async (fixture) => {
      startStub(fixture, "session-failed");

      const failed = await waitFor("proses gagal", () => {
        const session = getAgentSession("session-failed");
        return session?.status === "failed" ? session : undefined;
      });

      assert.equal(failed.pid, null);
      assert.ok(failed.error);
      assert.equal(stopAgentSession("session-failed", { force: true }), false);
      assert.equal(listAgentSessions().length, 1);
    },
  );
});

test("proses yang berhenti sendiri tercatat sebagai exited", async () => {
  await withFixture(
    { args: ["-e", "process.exit(7)"] },
    async (fixture) => {
      startStub(fixture, "session-exit");

      const exited = await waitFor("proses keluar", () => {
        const session = getAgentSession("session-exit");
        return session?.status === "exited" ? session : undefined;
      });

      assert.equal(exited.exitCode, 7);
      assert.equal(exited.status, "exited");
      assert.equal(stopAgentSession("session-exit", { force: true }), false);
    },
  );
});

test("menolak sesi, agen, episode, dan konflik yang tidak sah", async () => {
  await withFixture({}, async (fixture) => {
    expectSessionError(
      () =>
        startAgentSession({
          sessionId: "id dengan spasi",
          agentId: "stub",
          episodeSlug: fixture.episodeSlug,
          workspaceRoot: fixture.workspaceRoot,
        }),
      "invalid-session",
    );

    expectSessionError(
      () =>
        startAgentSession({
          sessionId: "session-unknown",
          agentId: "tidak-terdaftar",
          episodeSlug: fixture.episodeSlug,
          workspaceRoot: fixture.workspaceRoot,
        }),
      "unknown-agent",
    );

    expectSessionError(
      () =>
        startAgentSession({
          sessionId: "session-missing-episode",
          agentId: "stub",
          episodeSlug: "tidak-ada",
          workspaceRoot: fixture.workspaceRoot,
        }),
      "episode-not-found",
    );

    expectSessionError(
      () =>
        startAgentSession({
          sessionId: "session-relative",
          agentId: "stub",
          episodeSlug: fixture.episodeSlug,
          workspaceRoot: "workspace-relatif",
        }),
      "workspace",
    );

    startStub(fixture, "session-conflict");
    ensureEpisode(fixture.workspaceRoot, "episode-b");

    expectSessionError(
      () => startStub(fixture, "session-conflict", "episode-b"),
      "session-conflict",
    );

    assert.equal(listAgentSessions().length, 1);
  });
});

test("registry disimpan di globalThis agar bertahan saat modul dimuat ulang", async () => {
  await withFixture({}, async (fixture) => {
    startStub(fixture, "session-global");

    await waitFor("session-global berjalan", () => {
      const session = getAgentSession("session-global");
      return session?.status === "running" ? session : undefined;
    });

    const globalState = (
      globalThis as unknown as Record<string, unknown>
    )[AGENT_REGISTRY_GLOBAL_KEY] as
      | { sessions?: Map<string, unknown> }
      | undefined;

    assert.ok(globalState);
    assert.equal(globalState.sessions?.size, 1);
  });
});

test("cleanup tidak menghentikan proses di luar registry dan aman diulang", async () => {
  await withFixture({}, async (fixture) => {
    const unrelated = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { stdio: "ignore" },
    );

    assert.ok(unrelated.pid);

    try {
      startStub(fixture, "session-cleanup");

      const session = await waitFor("session-cleanup berjalan", () => {
        const current = getAgentSession("session-cleanup");
        return current?.status === "running" ? current : undefined;
      });

      assert.equal(stopAllAgentSessions({ force: true }), 1);
      await waitUntilDead(session.pid as number);

      assert.equal(isProcessAlive(unrelated.pid), true);
      assert.equal(stopAllAgentSessions({ force: true }), 0);
    } finally {
      unrelated.kill("SIGKILL");
    }
  });
});

test("penghentian server menghentikan agen dan turunannya", async () => {
  resetAgentRegistryForTests();
  const fixture = createFixture();
  const readyFile = path.join(fixture.root, "ready.json");
  const runnerPath = path.join(
    process.cwd(),
    "tests",
    "fixtures",
    "shutdown-runner.mjs",
  );
  const runner = spawn(process.execPath, [runnerPath], {
    env: {
      ...process.env,
      WORKSPACE_ROOT: fixture.workspaceRoot,
      READY_FILE: readyFile,
    },
    stdio: "ignore",
  });

  let agentPid: number | undefined;
  let grandchildPid: number | undefined;

  try {
    const ready = await waitFor("server uji siap", () =>
      readReady(readyFile),
    );

    if (ready.error) {
      throw new Error(ready.error);
    }

    assert.ok(ready.agentPid);
    agentPid = ready.agentPid;

    const pidInfo = await waitFor("pid file server uji", () =>
      readPidInfo(fixture.pidFile),
    );

    grandchildPid = pidInfo.grandchild;
    assert.equal(pidInfo.parent, agentPid);
    assert.equal(
      fs.realpathSync(pidInfo.cwd),
      fs.realpathSync(fixture.episodeDir),
    );

    const exited = new Promise<void>((resolve) => {
      runner.once("exit", () => resolve());
    });

    runner.kill("SIGTERM");
    await exited;

    await waitUntilDead(agentPid);
    await waitUntilDead(grandchildPid);
  } finally {
    if (runner.exitCode === null && runner.signalCode === null) {
      runner.kill("SIGKILL");
    }

    for (const pid of [agentPid, grandchildPid]) {
      if (!pid) continue;
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Sudah berhenti.
      }
    }

    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
