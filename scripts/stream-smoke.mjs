import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const mockPath = path.join(root, "tests", "fixtures", "mock-acp-agent.mjs");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stream-smoke-"));
const workspaceDir = path.join(tempDir, "workspace");
const tokenPath = path.join(tempDir, "server-token");
const projectDir = fs.mkdtempSync(path.join(root, ".next-smoke-"));

for (const entry of [
  "src",
  "package.json",
  "postcss.config.mjs",
  "next.config.ts",
  "tsconfig.json",
  "next-env.d.ts",
  "components.json",
]) {
  fs.cpSync(path.join(root, entry), path.join(projectDir, entry), {
    recursive: true,
  });
}

fs.mkdirSync(workspaceDir, { recursive: true });
fs.writeFileSync(
  path.join(workspaceDir, "agents.json"),
  JSON.stringify({
    agents: [
      {
        id: "mock-stream",
        name: "Mock Stream",
        command: process.execPath,
        args: [mockPath, "--scenario", "stream", "--delay-ms", "30"],
      },
      {
        id: "mock-slow",
        name: "Mock Slow",
        command: process.execPath,
        args: [mockPath, "--scenario", "stream", "--delay-ms", "150"],
      },
    ],
  }),
  "utf8",
);

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
let passed = 0;
let child;
let logs = "";

function check(name, condition, detail = "") {
  if (!condition) {
    throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }

  passed += 1;
  console.log(`PASS ${name}`);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function request(port, { method = "GET", requestPath = "/", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: requestPath,
        method,
        headers: {
          host: `127.0.0.1:${port}`,
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": payload.length,
              }
            : {}),
          ...headers,
        },
        setHost: false,
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => {
          responseBody += chunk.toString();
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: responseBody,
          });
        });
      },
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function stopServer() {
  if (!child?.pid || child.exitCode !== null) return;
  const pid = child.pid;

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      resolve();
    }
  });

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // Sudah berhenti.
  }
}

function parseSseBlock(block) {
  const lines = block.split("\n");
  let id = null;
  let event = "message";
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("id: ")) id = line.slice(4);
    else if (line.startsWith("event: ")) event = line.slice(7);
    else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
  }

  if (dataLines.length === 0) return null;

  try {
    return { id, event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

function openSse(port, requestPath, options = {}) {
  let aborted = false;
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const headers = {
    host: `127.0.0.1:${port}`,
    Accept: "text/event-stream",
    ...(options.lastEventId
      ? { "Last-Event-ID": options.lastEventId }
      : {}),
    ...(options.origin ? { Origin: options.origin } : {}),
  };

  let buffer = "";

  const req = http.request(
    {
      hostname: "127.0.0.1",
      port,
      path: requestPath,
      method: "GET",
      headers,
      setHost: false,
    },
    (res) => {
      if (res.statusCode !== 200) {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          resolveDone({ status: res.statusCode, body });
        });
        return;
      }

      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buffer += chunk;

        for (;;) {
          const separator = buffer.indexOf("\n\n");
          if (separator === -1) break;

          const block = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          const event = parseSseBlock(block);
          if (event) options.onEvent?.(event);
        }
      });
      res.on("end", () => {
        resolveDone({ status: 200 });
      });
    },
  );

  req.on("error", (error) => {
    resolveDone({
      status: 0,
      error: aborted ? undefined : error,
    });
  });

  req.end();

  return {
    done,
    abort() {
      aborted = true;
      req.destroy();
      resolveDone({ status: 0 });
    },
  };
}

async function collectSse(port, requestPath, options = {}) {
  const events = [];
  let connection;
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timeout SSE ${requestPath}`)),
      20000,
    );
  });

  connection = openSse(port, requestPath, {
    lastEventId: options.lastEventId,
    origin: options.origin,
    onEvent: (event) => {
      events.push(event);

      if (
        options.stopOnFirstUpdate &&
        event.event === "update" &&
        event.data?.update?.sessionUpdate === "agent_message_chunk"
      ) {
        connection.abort();
        return;
      }

      if (
        event.event === "status" &&
        event.data?.status !== "running"
      ) {
        connection.abort();
      }
    },
  });

  try {
    const result = await Promise.race([connection.done, timeout]);

    return {
      status: result.status,
      body: result.body,
      events,
    };
  } finally {
    clearTimeout(timer);
  }
}

function readLog(workspace, slug, kind) {
  const filePath = path.join(
    workspace,
    "episodes",
    slug,
    "logs",
    `${kind}.jsonl`,
  );

  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function waitForLogStatus(slug, kind, status) {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    const events = readLog(workspaceDir, slug, kind);
    if (
      events.some(
        (event) => event.type === "status" && event.status === status,
      )
    ) {
      return;
    }
    await delay(50);
  }

  throw new Error(`Timeout menunggu status ${status} di log.`);
}

try {
  const port = await getFreePort();
  child = spawn(
    process.execPath,
    [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: projectDir,
      env: {
        ...process.env,
        APP_PORT: String(port),
        WORKFLOW_TOKEN_PATH: tokenPath,
        WORKSPACE_DIR: workspaceDir,
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  const readyDeadline = Date.now() + 90000;
  while (Date.now() < readyDeadline) {
    try {
      const response = await request(port, {
        requestPath: "/api/security/session",
      });
      if (response.status === 200) break;
    } catch {
      // Server belum siap.
    }
    await delay(250);
  }

  const token = fs.readFileSync(tokenPath, "utf8").trim();
  const origin = `http://127.0.0.1:${port}`;

  const created = await request(port, {
    method: "POST",
    requestPath: "/api/episodes",
    headers: { Origin: origin, "x-workflow-token": token },
    body: JSON.stringify({
      title: "Stream Smoke",
      topic: "M1-4",
    }),
  });
  const createdData = JSON.parse(created.body);
  const slug = createdData.episode?.slug;
  check("episode dibuat", created.status === 201 && Boolean(slug));

  const detailPage = await request(port, {
    requestPath: `/episodes/${slug}`,
  });
  check(
    "panel chat tampil di halaman detail",
    detailPage.status === 200 &&
      detailPage.body.includes("Chat agen"),
  );

  const run = await request(port, {
    method: "POST",
    requestPath: `/api/episodes/${slug}/steps/script/run`,
    headers: { Origin: origin, "x-workflow-token": token },
    body: JSON.stringify({
      agentId: "mock-stream",
      prompt: "Halo stream smoke",
    }),
  });
  const runData = JSON.parse(run.body);
  const attemptId = runData.attempt?.attemptId;
  check("sesi streaming dimulai", run.status === 201 && Boolean(attemptId));

  const stream = await collectSse(
    port,
    `/api/episodes/${slug}/steps/script/stream`,
  );
  const streamEvents = stream.events;

  check(
    "SSE mengirim prompt, update, dan status selesai",
    streamEvents.some((event) => event.event === "prompt") &&
      streamEvents.filter(
        (event) =>
          event.event === "update" &&
          event.data?.update?.sessionUpdate === "agent_message_chunk",
      ).length >= 3 &&
      streamEvents.some(
        (event) =>
          event.event === "status" &&
          event.data?.status === "completed",
      ),
  );
  check(
    "semua event memakai attempt yang sama",
    streamEvents.every((event) => event.data?.attemptId === attemptId),
  );
  check(
    "urutan seq tidak duplikat",
    new Set(
      streamEvents.map((event) => event.data?.seq),
    ).size === streamEvents.length,
  );
  check(
    "stream tidak membocorkan token",
    !JSON.stringify(streamEvents).includes(token),
  );

  const logBeforeRefresh = readLog(workspaceDir, slug, "script");
  const refresh = await collectSse(
    port,
    `/api/episodes/${slug}/steps/script/stream`,
  );
  const logAfterRefresh = readLog(workspaceDir, slug, "script");

  check(
    "refresh memutar ulang riwayat tanpa memulai sesi baru",
    refresh.events.some((event) => event.event === "prompt") &&
      refresh.events.some(
        (event) =>
          event.event === "status" &&
          event.data?.status === "completed",
      ) &&
      new Set(logAfterRefresh.map((event) => event.attemptId)).size === 1 &&
      logAfterRefresh.length === logBeforeRefresh.length,
  );

  const slowRun = await request(port, {
    method: "POST",
    requestPath: `/api/episodes/${slug}/steps/tags/run`,
    headers: { Origin: origin, "x-workflow-token": token },
    body: JSON.stringify({
      agentId: "mock-slow",
      prompt: "Halo reconnect",
    }),
  });
  const slowAttemptId = JSON.parse(slowRun.body).attempt?.attemptId;
  check("sesi slow dimulai", slowRun.status === 201 && Boolean(slowAttemptId));

  const firstPart = await collectSse(
    port,
    `/api/episodes/${slug}/steps/tags/stream`,
    { stopOnFirstUpdate: true },
  );
  const lastEvent = firstPart.events.at(-1);
  check(
    "refresh saat berjalan memutar riwayat dari awal",
    firstPart.events.some((event) => event.event === "prompt"),
  );
  check(
    "koneksi pertama menerima sebagian update",
    firstPart.events.some(
      (event) =>
        event.event === "update" &&
        event.data?.update?.sessionUpdate === "agent_message_chunk",
    ),
  );

  const logBeforeReconnect = readLog(workspaceDir, slug, "tags");
  check(
    "sesi masih berjalan saat reconnect",
    !logBeforeReconnect.some(
      (event) =>
        event.type === "status" && event.status === "completed",
    ),
  );

  const reconnected = await collectSse(
    port,
    `/api/episodes/${slug}/steps/tags/stream`,
    { lastEventId: lastEvent?.id },
  );

  check(
    "reconnect memulihkan update yang terlewat",
    reconnected.events.some(
      (event) =>
        event.event === "status" &&
        event.data?.status === "completed",
    ) &&
      reconnected.events.every(
        (event) => event.data?.attemptId === slowAttemptId,
      ),
  );

  await waitForLogStatus(slug, "tags", "completed");

  const combinedKeys = [
    ...firstPart.events,
    ...reconnected.events,
  ].map((event) => event.id);
  check(
    "reconnect tidak menggandakan event",
    new Set(combinedKeys).size === combinedKeys.length,
  );

  const combinedSeqs = [
    ...firstPart.events,
    ...reconnected.events,
  ]
    .map((event) => event.data?.seq)
    .sort((left, right) => left - right);
  const expectedSeqs = Array.from(
    { length: combinedSeqs.length },
    (_, index) => index + 1,
  );
  check(
    "reconnect tidak kehilangan urutan event",
    combinedSeqs.every(
      (seq, index) => seq === expectedSeqs[index],
    ),
  );

  const invalidKind = await request(port, {
    requestPath: `/api/episodes/${slug}/steps/chat/stream`,
  });
  check("jenis langkah tidak valid ditolak", invalidKind.status === 400);

  const missingEpisode = await request(port, {
    requestPath: "/api/episodes/tidak-ada/steps/script/stream",
  });
  check(
    "episode tidak ditemukan ditolak",
    missingEpisode.status === 404,
  );

  const badOrigin = await collectSse(
    port,
    `/api/episodes/${slug}/steps/script/stream`,
    { origin: "https://evil.example" },
  );
  check("Origin asing ditolak guard", badOrigin.status === 403);

  console.log(`\n${passed} pemeriksaan streaming lulus.`);
} catch (error) {
  console.error(`\n${error.message}`);
  if (logs) console.error(`\n--- log server ---\n${logs.slice(-5000)}`);
  process.exitCode = 1;
} finally {
  await stopServer();
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.rmSync(projectDir, { recursive: true, force: true });
}
