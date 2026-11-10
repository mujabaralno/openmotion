import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AcpClientError,
  AcpSession,
  runAcpPrompt,
} from "../src/server/acp/client.ts";
import type {
  AcpPermissionRequest,
  AcpUpdate,
} from "../src/server/acp/types.ts";
import {
  getAgentSession,
  resetAgentRegistryForTests,
  stopAllAgentSessions,
} from "../src/server/agents/registry.ts";

const mockPath = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "mock-acp-agent.mjs",
);

type Workspace = {
  root: string;
  workspaceRoot: string;
  episodeDir: string;
};

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ESRCH"
    );
  }
}

async function waitUntil(
  label: string,
  check: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (check()) return;
    await delay(20);
  }

  throw new Error(`Timeout menunggu ${label}.`);
}

function createWorkspace(): Workspace {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acp-client-test-"));
  const workspaceRoot = path.join(root, "workspace");
  const episodeDir = path.join(workspaceRoot, "episodes", "episode-a");

  fs.mkdirSync(episodeDir, { recursive: true });
  fs.writeFileSync(
    path.join(episodeDir, "episode.json"),
    JSON.stringify({ slug: "episode-a" }),
    "utf8",
  );

  const mock = (scenario: string) => [
    mockPath,
    "--scenario",
    scenario,
    "--delay-ms",
    "20",
  ];

  fs.writeFileSync(
    path.join(workspaceRoot, "agents.json"),
    JSON.stringify({
      agents: [
        {
          id: "mock-stream",
          name: "Mock Stream",
          command: process.execPath,
          args: mock("stream"),
        },
        {
          id: "mock-permission",
          name: "Mock Permission",
          command: process.execPath,
          args: mock("permission"),
        },
        {
          id: "mock-hang",
          name: "Mock Hang",
          command: process.execPath,
          args: ["-e", "setInterval(() => {}, 1000)"],
        },
        {
          id: "mock-exit",
          name: "Mock Exit",
          command: process.execPath,
          args: ["-e", "process.exit(1)"],
        },
        {
          id: "mock-invalid",
          name: "Mock Invalid",
          command: process.execPath,
          args: [
            "-e",
            "process.stdout.write('bukan json\\n'); setInterval(() => {}, 1000)",
          ],
        },
      ],
    }),
    "utf8",
  );

  return { root, workspaceRoot, episodeDir };
}

async function withWorkspace(
  run: (workspace: Workspace) => Promise<void>,
) {
  resetAgentRegistryForTests();
  const workspace = createWorkspace();

  try {
    await run(workspace);
  } finally {
    stopAllAgentSessions({ force: true });
    await delay(100);
    resetAgentRegistryForTests();
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
}

function textOf(updates: AcpUpdate[]): string {
  return updates
    .filter((update) => update.sessionUpdate === "agent_message_chunk")
    .map((update) => update.content?.text ?? "")
    .join("");
}

test("menghubungkan sesi, mengirim prompt, dan menerima update bertahap", async () => {
  await withWorkspace(async ({ workspaceRoot, episodeDir }) => {
    const observed: AcpUpdate[] = [];
    const session = new AcpSession({
      sessionId: "acp-stream",
      agentId: "mock-stream",
      episodeSlug: "episode-a",
      workspaceRoot,
      onUpdate: (update) => observed.push(update),
    });

    try {
      await session.start();

      assert.equal(session.applicationSessionId, "acp-stream");
      assert.match(session.remoteSessionId ?? "", /^mock-session-/);

      const prompt = session.prompt("Halo dunia");
      await waitUntil("update pertama", () => observed.length > 0, 3000);

      const result = await prompt;

      assert.equal(result.stopReason, "end_turn");
      assert.equal(result.appSessionId, "acp-stream");
      assert.ok(result.updates.length >= 3);
      assert.match(textOf(result.updates), /Halo dari mock ACP/);
      assert.equal(fs.existsSync(path.join(episodeDir, "mock-output.txt")), false);
    } finally {
      await session.close();
    }

    const registrySession = getAgentSession("acp-stream");
    assert.ok(registrySession);
    assert.equal(registrySession.status, "stopped");

    if (registrySession.pid) {
      assert.equal(isProcessAlive(registrySession.pid), false);
    }
  });
});

test("dua sesi tidak mencampur update atau proses", async () => {
  await withWorkspace(async ({ workspaceRoot }) => {
    const streamSession = new AcpSession({
      sessionId: "isolation-stream",
      agentId: "mock-stream",
      episodeSlug: "episode-a",
      workspaceRoot,
    });
    const permissionSession = new AcpSession({
      sessionId: "isolation-permission",
      agentId: "mock-permission",
      episodeSlug: "episode-a",
      workspaceRoot,
    });

    try {
      await Promise.all([streamSession.start(), permissionSession.start()]);

      const [streamResult, permissionResult] = await Promise.all([
        streamSession.prompt("stream"),
        permissionSession.prompt("permission"),
      ]);

      assert.equal(streamResult.stopReason, "end_turn");
      assert.equal(permissionResult.stopReason, "end_turn");
      assert.equal(
        streamResult.updates.some(
          (update) => update.sessionUpdate === "tool_call",
        ),
        false,
      );
      assert.equal(
        permissionResult.updates.some(
          (update) => update.sessionUpdate === "tool_call",
        ),
        true,
      );
      assert.match(textOf(streamResult.updates), /Halo dari mock ACP/);
      assert.doesNotMatch(textOf(streamResult.updates), /Izin ditolak/);
      assert.match(textOf(permissionResult.updates), /Izin ditolak/);
    } finally {
      await Promise.all([
        streamSession.close(),
        permissionSession.close(),
      ]);
    }
  });
});

test("permintaan izin ditolak secara default tanpa persetujuan otomatis", async () => {
  await withWorkspace(async ({ workspaceRoot, episodeDir }) => {
    const result = await runAcpPrompt({
      sessionId: "acp-deny",
      agentId: "mock-permission",
      episodeSlug: "episode-a",
      workspaceRoot,
      prompt: "Tulis berkas uji",
    });

    assert.equal(result.stopReason, "end_turn");
    assert.equal(
      fs.existsSync(path.join(episodeDir, "mock-output.txt")),
      false,
    );
    assert.match(textOf(result.updates), /Izin ditolak; file tidak ditulis/);
    assert.equal(getAgentSession("acp-deny")?.status, "stopped");
  });
});

test("handler izin dapat menyetujui penulisan file", async () => {
  await withWorkspace(async ({ workspaceRoot, episodeDir }) => {
    let seenRequest: AcpPermissionRequest | null = null;

    const result = await runAcpPrompt({
      sessionId: "acp-allow",
      agentId: "mock-permission",
      episodeSlug: "episode-a",
      workspaceRoot,
      prompt: "Tulis berkas uji",
      onPermissionRequest: (request) => {
        seenRequest = request;
        return { outcome: "selected", optionId: "allow" };
      },
    });

    assert.ok(seenRequest);
    assert.equal(result.stopReason, "end_turn");
    assert.equal(
      fs.readFileSync(path.join(episodeDir, "mock-output.txt"), "utf8"),
      `approved:${result.acpSessionId}:Tulis berkas uji\n`,
    );
    assert.equal(getAgentSession("acp-allow")?.status, "stopped");
  });
});

test("agen tanpa respons menghasilkan timeout yang jelas dan dibersihkan", async () => {
  await withWorkspace(async ({ workspaceRoot }) => {
    await assert.rejects(
      () =>
        runAcpPrompt({
          sessionId: "acp-hang",
          agentId: "mock-hang",
          episodeSlug: "episode-a",
          workspaceRoot,
          prompt: "Halo",
          initializeTimeoutMs: 300,
        }),
      (error) =>
        error instanceof AcpClientError && error.code === "timeout",
    );

    const registrySession = getAgentSession("acp-hang");
    assert.ok(registrySession);
    assert.equal(registrySession.status, "stopped");

    if (registrySession.pid) {
      assert.equal(isProcessAlive(registrySession.pid), false);
    }
  });
});

test("proses yang terputus atau respons tidak valid gagal dengan jelas", async () => {
  await withWorkspace(async ({ workspaceRoot }) => {
    await assert.rejects(
      () =>
        runAcpPrompt({
          sessionId: "acp-exit",
          agentId: "mock-exit",
          episodeSlug: "episode-a",
          workspaceRoot,
          prompt: "Halo",
          initializeTimeoutMs: 1000,
        }),
      (error) =>
        error instanceof AcpClientError &&
        error.code === "connection-lost",
    );

    await assert.rejects(
      () =>
        runAcpPrompt({
          sessionId: "acp-invalid",
          agentId: "mock-invalid",
          episodeSlug: "episode-a",
          workspaceRoot,
          prompt: "Halo",
          initializeTimeoutMs: 1000,
        }),
      (error) =>
        error instanceof AcpClientError &&
        error.code === "connection-lost" &&
        /JSON/i.test(error.message),
    );

    assert.equal(getAgentSession("acp-exit")?.status === "stopped" || getAgentSession("acp-exit")?.status === "exited", true);
    assert.equal(getAgentSession("acp-invalid")?.status === "stopped" || getAgentSession("acp-invalid")?.status === "exited", true);
  });
});
