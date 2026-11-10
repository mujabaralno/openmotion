import { spawn } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const initializeOnly = args.includes("--initialize-only");
const [command, ...commandArgs] = args.filter((arg) => arg !== "--initialize-only");

if (!command) {
  console.error(
    "usage: node scripts/acp-handshake.mjs [--initialize-only] <command> [args...]",
  );
  process.exit(2);
}

const cwd = path.resolve(process.cwd());
const child = spawn(command, commandArgs, {
  cwd,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, NO_BROWSER: "1" },
});

let buffer = "";
let settled = false;

const finish = (code) => {
  if (settled) return;
  settled = true;
  child.kill("SIGTERM");
  setTimeout(() => child.kill("SIGKILL"), 2000).unref();
  setTimeout(() => process.exit(code), 2500).unref();
};

const timer = setTimeout(() => {
  console.error("timeout: no response from agent");
  finish(1);
}, 120000);

const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");

child.on("error", (error) => {
  clearTimeout(timer);
  console.error(`failed to start agent: ${error.message}`);
  finish(1);
});

child.stderr.on("data", (chunk) => process.stderr.write(chunk.toString()));

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();

  for (;;) {
    const newline = buffer.indexOf("\n");
    if (newline === -1) break;

    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }

    if (message.id === 1) {
      if (message.error) {
        console.error(JSON.stringify(message.error, null, 2));
        clearTimeout(timer);
        finish(1);
        return;
      }

      console.log(
        JSON.stringify(
          {
            stage: "initialize",
            protocolVersion: message.result?.protocolVersion,
            agentInfo: message.result?.agentInfo,
            agentCapabilities: message.result?.agentCapabilities,
            authMethods: message.result?.authMethods,
          },
          null,
          2,
        ),
      );

      if (initializeOnly) {
        clearTimeout(timer);
        finish(0);
        return;
      }

      send({
        jsonrpc: "2.0",
        id: 2,
        method: "session/new",
        params: { cwd, mcpServers: [] },
      });
      continue;
    }

    if (message.id === 2) {
      clearTimeout(timer);
      if (message.error) {
        console.error(JSON.stringify(message.error, null, 2));
        finish(1);
        return;
      }

      console.log(
        JSON.stringify(
          {
            stage: "session/new",
            ok: Boolean(message.result?.sessionId),
            sessionId: message.result?.sessionId,
            modes: message.result?.modes,
          },
          null,
          2,
        ),
      );
      finish(message.result?.sessionId ? 0 : 1);
    }
  }
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
    clientInfo: {
      name: "workflow-studio-spike",
      title: "Workflow Studio Spike",
      version: "0.1.0",
    },
  },
});

process.on("exit", () => {
  child.kill("SIGTERM");
});
