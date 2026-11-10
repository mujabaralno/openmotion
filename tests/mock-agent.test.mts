import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AcpTestClient,
  type AgentUpdate,
} from "./helpers/acp-test-client.mts";

const mockPath = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "mock-acp-agent.mjs",
);

type PromptResult = { stopReason: string };

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

async function waitUntilDead(pid: number): Promise<void> {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return;
    await delay(25);
  }

  throw new Error(`Proses ${pid} masih hidup.`);
}

async function withMock(
  args: string[],
  run: (client: AcpTestClient, cwd: string) => Promise<void>,
) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "mock-acp-test-"));
  const client = new AcpTestClient(
    process.execPath,
    [mockPath, ...args],
    cwd,
  );

  try {
    await run(client, cwd);
  } finally {
    await client.close();
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

async function openSession(
  client: AcpTestClient,
  cwd: string,
): Promise<string> {
  const initialized = await client.request<{ protocolVersion: number }>(
    "initialize",
    {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "mock-test", version: "1.0.0" },
    },
  );

  assert.equal(initialized.protocolVersion, 1);

  const session = await client.request<{ sessionId: string }>(
    "session/new",
    { cwd, mcpServers: [] },
  );

  assert.match(session.sessionId, /^mock-session-/);
  return session.sessionId;
}

function textChunks(client: AcpTestClient): string[] {
  return client.updates
    .filter((update) => update.sessionUpdate === "agent_message_chunk")
    .map((update) => update.content?.text ?? "");
}

function outputFile(cwd: string): string {
  return path.join(cwd, "mock-output.txt");
}

test("skenario stream mengirim beberapa bagian sebelum selesai", async () => {
  await withMock(
    ["--scenario", "stream", "--delay-ms", "20"],
    async (client, cwd) => {
      const sessionId = await openSession(client, cwd);
      const prompt = client.request<PromptResult>("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: "Halo" }],
      });

      await client.waitForUpdate(
        (update) => update.sessionUpdate === "agent_message_chunk",
      );

      const result = await prompt;

      assert.equal(result.stopReason, "end_turn");
      assert.match(textChunks(client).join(""), /Halo dari mock ACP/);
      assert.ok(textChunks(client).length >= 3);
      assert.equal(fs.existsSync(outputFile(cwd)), false);
    },
  );
});

test("izin disetujui baru menulis file setelah keputusan", async () => {
  await withMock(
    ["--scenario", "permission", "--delay-ms", "20"],
    async (client, cwd) => {
      const sessionId = await openSession(client, cwd);
      const prompt = client.request<PromptResult>("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: "Tulis berkas uji" }],
      });

      const permission = await client.waitForPermission();

      assert.equal(fs.existsSync(outputFile(cwd)), false);
      assert.equal(
        permission.params.options.some(
          (option) => option.optionId === "allow",
        ),
        true,
      );

      client.respondPermission(permission.id, {
        outcome: "selected",
        optionId: "allow",
      });

      const result = await prompt;

      assert.equal(result.stopReason, "end_turn");
      assert.equal(
        fs.readFileSync(outputFile(cwd), "utf8"),
        `approved:${sessionId}:Tulis berkas uji\n`,
      );
      assert.ok(
        client.updates.some(
          (update) =>
            update.sessionUpdate === "tool_call" &&
            update.status === "pending",
        ),
      );
      assert.ok(
        client.updates.some(
          (update) =>
            update.sessionUpdate === "tool_call_update" &&
            update.status === "completed",
        ),
      );
    },
  );
});

test("izin ditolak tidak menulis file", async () => {
  await withMock(
    ["--scenario", "permission", "--delay-ms", "20"],
    async (client, cwd) => {
      const sessionId = await openSession(client, cwd);
      const prompt = client.request<PromptResult>("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: "Tulis berkas uji" }],
      });
      const permission = await client.waitForPermission();

      client.respondPermission(permission.id, {
        outcome: "selected",
        optionId: "deny",
      });

      const result = await prompt;

      assert.equal(result.stopReason, "end_turn");
      assert.equal(fs.existsSync(outputFile(cwd)), false);
      assert.match(
        textChunks(client).join(""),
        /Izin ditolak; file tidak ditulis/,
      );
      assert.ok(
        client.updates.some(
          (update: AgentUpdate) =>
            update.sessionUpdate === "tool_call_update" &&
            update.status === "failed",
        ),
      );
    },
  );
});

test("tanpa keputusan agen menunggu dan tidak menulis file", async () => {
  await withMock(
    ["--scenario", "permission", "--delay-ms", "20"],
    async (client, cwd) => {
      const sessionId = await openSession(client, cwd);
      const prompt = client.request<PromptResult>("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: "Tulis berkas uji" }],
      });
      void prompt.catch(() => {});

      await client.waitForPermission();
      let settled = false;
      void prompt.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );

      await delay(200);

      assert.equal(settled, false);
      assert.equal(fs.existsSync(outputFile(cwd)), false);

      client.cancel(sessionId);

      const result = await prompt;
      assert.equal(result.stopReason, "cancelled");
      assert.equal(fs.existsSync(outputFile(cwd)), false);
    },
  );
});

test("pembatalan saat streaming menghentikan keluaran dan penulisan", async () => {
  await withMock(
    ["--scenario", "stream", "--delay-ms", "150"],
    async (client, cwd) => {
      const sessionId = await openSession(client, cwd);
      const prompt = client.request<PromptResult>("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: "Halo" }],
      });

      await client.waitForUpdate(
        (update) => update.sessionUpdate === "agent_message_chunk",
      );

      client.cancel(sessionId);

      const result = await prompt;
      assert.equal(result.stopReason, "cancelled");

      const updateCount = client.updates.length;
      await delay(300);

      assert.equal(client.updates.length, updateCount);
      assert.equal(fs.existsSync(outputFile(cwd)), false);
    },
  );
});

test("pembatalan menghentikan proses turunan", async () => {
  await withMock(
    [
      "--scenario",
      "permission",
      "--delay-ms",
      "20",
      "--spawn-child",
      "--child-pid-file",
      "child.pid",
    ],
    async (client, cwd) => {
      const sessionId = await openSession(client, cwd);
      const prompt = client.request<PromptResult>("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: "Tulis berkas uji" }],
      });

      await client.waitForPermission();

      const childPidFile = path.join(cwd, "child.pid");
      await client.waitUntil(
        "file pid child",
        () => fs.existsSync(childPidFile),
      );

      const childInfo = JSON.parse(
        fs.readFileSync(childPidFile, "utf8"),
      ) as { parent: number; child: number };

      assert.equal(childInfo.parent, client.child.pid);
      assert.equal(isProcessAlive(childInfo.child), true);
      assert.equal(fs.existsSync(outputFile(cwd)), false);

      client.cancel(sessionId);

      const result = await prompt;
      assert.equal(result.stopReason, "cancelled");

      await waitUntilDead(childInfo.child);
      assert.equal(fs.existsSync(outputFile(cwd)), false);
    },
  );
});
