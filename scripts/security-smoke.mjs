import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "workflow-studio-security-"),
);
const tokenPath = path.join(temporaryDirectory, "server-token");
const projectDirectory = fs.mkdtempSync(path.join(root, ".next-smoke-"));

for (const entry of [
  "src",
  "package.json",
  "next.config.ts",
  "tsconfig.json",
  "next-env.d.ts",
]) {
  fs.cpSync(path.join(root, entry), path.join(projectDirectory, entry), {
    recursive: true,
  });
}

const servers = [];
let passed = 0;

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

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

function startServer(port) {
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: projectDirectory,
      env: {
        ...process.env,
        APP_PORT: String(port),
        WORKFLOW_TOKEN_PATH: tokenPath,
        WORKSPACE_DIR: path.join(temporaryDirectory, "workspace"),
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );

  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  const server = { child, logs: () => logs };
  servers.push(server);
  return server;
}

async function stopServer(server) {
  if (!server?.child?.pid) return;
  if (server.child.exitCode !== null || server.child.signalCode !== null) return;

  const pid = server.child.pid;

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    server.child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        server.child.kill("SIGTERM");
      } catch {
        resolve();
      }
    }
  });

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // Proses sudah berhenti.
  }
}

function request(port, { method = "GET", requestPath = "/", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: requestPath,
        method,
        headers: {
          host: `127.0.0.1:${port}`,
          ...headers,
        },
        setHost: false,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

async function waitForServer(port) {
  const deadline = Date.now() + 90000;
  let lastError = "belum ada respons";

  while (Date.now() < deadline) {
    try {
      const response = await request(port, {
        requestPath: "/api/security/session",
      });

      if (response.status === 200) return response;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }

    await delay(250);
  }

  throw new Error(`server tidak siap: ${lastError}`);
}

async function waitForToken() {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    try {
      const token = fs.readFileSync(tokenPath, "utf8").trim();
      if (/^[a-f0-9]{64}$/.test(token)) return token;
    } catch {
      // File token belum dibuat.
    }

    await delay(100);
  }

  throw new Error("token server tidak ditemukan");
}

function check(name, condition, detail = "") {
  if (!condition) {
    throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }

  passed += 1;
  console.log(`PASS ${name}`);
}

function cookiePairFrom(response) {
  const setCookie = response.headers["set-cookie"] ?? [];
  const cookie = setCookie
    .map((value) => value.split(";")[0])
    .find((value) => value.startsWith("workflow_studio_token="));

  return cookie ?? null;
}

async function runFirstServer(port) {
  const session = await waitForServer(port);
  const token = await waitForToken();
  const setCookie = (session.headers["set-cookie"] ?? []).join("\n");
  const cookie = cookiePairFrom(session);
  const origin = `http://127.0.0.1:${port}`;

  check("host sah mendapat respons", session.status === 200);
  check("cookie token dikirim", cookie === `workflow_studio_token=${token}`);
  check("cookie HttpOnly", /httponly/i.test(setCookie));
  check("cookie SameSite=strict", /samesite=strict/i.test(setCookie));
  check("cookie memiliki Path=/", /path=\//i.test(setCookie));
  check("body session tidak memuat token", !session.body.includes(token));

  const read = await request(port, { requestPath: "/api/security/check" });
  check("GET tanpa Origin diizinkan", read.status === 200);

  const writeWithHeader = await request(port, {
    method: "POST",
    requestPath: "/api/security/check",
    headers: { origin, "x-workflow-token": token },
  });
  check(
    "POST dengan Origin dan token header diterima",
    writeWithHeader.status === 200,
  );

  const writeWithCookie = await request(port, {
    method: "POST",
    requestPath: "/api/security/check",
    headers: { origin, cookie },
  });
  check(
    "POST dengan Origin dan cookie token diterima",
    writeWithCookie.status === 200,
  );

  const withoutOrigin = await request(port, {
    method: "POST",
    requestPath: "/api/security/check",
    headers: { "x-workflow-token": token },
  });
  check("POST tanpa Origin ditolak", withoutOrigin.status === 403);

  const withoutToken = await request(port, {
    method: "POST",
    requestPath: "/api/security/check",
    headers: { origin },
  });
  check("POST tanpa token ditolak", withoutToken.status === 403);

  const wrongToken = await request(port, {
    method: "POST",
    requestPath: "/api/security/check",
    headers: { origin, "x-workflow-token": "b".repeat(64) },
  });
  check("POST dengan token salah ditolak", wrongToken.status === 403);

  const wrongOrigin = await request(port, {
    method: "POST",
    requestPath: "/api/security/check",
    headers: {
      origin: "https://evil.example",
      "x-workflow-token": token,
    },
  });
  check("POST dengan Origin asing ditolak", wrongOrigin.status === 403);

  const wrongPortOrigin = await request(port, {
    method: "POST",
    requestPath: "/api/security/check",
    headers: {
      origin: `http://127.0.0.1:${port + 1}`,
      "x-workflow-token": token,
    },
  });
  check("POST dengan port Origin salah ditolak", wrongPortOrigin.status === 403);

  const wrongHost = await request(port, {
    method: "POST",
    requestPath: "/api/security/check",
    headers: {
      host: "evil.example",
      origin,
      "x-workflow-token": token,
    },
  });
  check("POST dengan Host asing ditolak", wrongHost.status === 403);

  const readWrongOrigin = await request(port, {
    requestPath: "/api/security/check",
    headers: { origin: "https://evil.example" },
  });
  check("GET dengan Origin asing ditolak", readWrongOrigin.status === 403);

  const sessionWrongOrigin = await request(port, {
    requestPath: "/api/security/session",
    headers: { origin: "https://evil.example" },
  });
  check(
    "situs lain tidak bisa mengambil token",
    sessionWrongOrigin.status === 403 &&
      cookiePairFrom(sessionWrongOrigin) === null,
  );

  const deniedResponses = [
    withoutOrigin,
    withoutToken,
    wrongToken,
    wrongOrigin,
    wrongPortOrigin,
    wrongHost,
    readWrongOrigin,
    sessionWrongOrigin,
  ];

  check(
    "respons penolakan tidak membocorkan token",
    deniedResponses.every((response) => !response.body.includes(token)),
  );
  check(
    "token tidak berubah selama server berjalan",
    fs.readFileSync(tokenPath, "utf8").trim() === token,
  );

  return token;
}

async function runSecondServer(port, oldToken) {
  await waitForServer(port);
  const newToken = await waitForToken();
  const origin = `http://127.0.0.1:${port}`;

  check("token diganti setelah restart", newToken !== oldToken);

  const oldTokenWrite = await request(port, {
    method: "POST",
    requestPath: "/api/security/check",
    headers: { origin, "x-workflow-token": oldToken },
  });
  check("token lama ditolak setelah restart", oldTokenWrite.status === 403);

  const session = await request(port, {
    requestPath: "/api/security/session",
  });
  const cookie = cookiePairFrom(session);

  check(
    "UI mendapat token baru lewat cookie",
    session.status === 200 &&
      cookie === `workflow_studio_token=${newToken}`,
  );

  const newTokenWrite = await request(port, {
    method: "POST",
    requestPath: "/api/security/check",
    headers: { origin, "x-workflow-token": newToken },
  });
  check("token baru diterima", newTokenWrite.status === 200);
}

async function main() {
  const firstPort = await getFreePort();
  startServer(firstPort);
  const oldToken = await runFirstServer(firstPort);

  await stopServer(servers[0]);
  await delay(500);

  const secondPort = await getFreePort();
  startServer(secondPort);
  await runSecondServer(secondPort, oldToken);

  console.log(`\n${passed} pemeriksaan keamanan lulus.`);
}

try {
  await main();
} catch (error) {
  console.error(`\n${error.message}`);
  for (const server of servers) {
    const logs = server.logs();
    if (logs) console.error(`\n--- log server ---\n${logs.slice(-3000)}`);
  }
  process.exitCode = 1;
} finally {
  for (const server of servers) {
    await stopServer(server);
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  fs.rmSync(projectDirectory, { recursive: true, force: true });
}
