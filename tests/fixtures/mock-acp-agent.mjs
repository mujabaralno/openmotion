import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MOCK_VERSION = "0.1.0";
const AGENT_MESSAGE_ID = "msg_mock_agent";
const TOOL_CALL_ID = "mock-write-file";
const SCENARIOS = new Set(["stream", "permission"]);

function logError(message) {
  process.stderr.write(`[mock-acp] ${message}\n`);
}

function fail(message, exitCode = 2) {
  logError(message);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const values = new Map();
  const flags = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (!argument.startsWith("--")) {
      fail(`Argumen tidak dikenal: ${argument}`);
    }

    if (argument === "--spawn-child") {
      flags.add("spawn-child");
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail(`Argumen ${argument} membutuhkan nilai.`);
    }

    values.set(argument.slice(2), value);
    index += 1;
  }

  const scenario = values.get("scenario") ?? "stream";
  if (!SCENARIOS.has(scenario)) {
    fail(
      `Skenario tidak dikenal: ${scenario}. Pilih stream atau permission.`,
    );
  }

  const delayMs = Number(values.get("delay-ms") ?? "25");
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    fail("--delay-ms harus berupa angka >= 0.");
  }

  return {
    scenario,
    delayMs,
    spawnChild: flags.has("spawn-child"),
    childPidFile: values.get("child-pid-file") ?? null,
    fileName: values.get("file-name") ?? "mock-output.txt",
  };
}

const options = parseArgs(process.argv.slice(2));
const sessions = new Map();
let nextSessionNumber = 1;
let nextRequestId = 1000;
let shuttingDown = false;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function notify(sessionId, update) {
  send({
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId, update },
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function streamChunk(sessionId, text) {
  notify(sessionId, {
    sessionUpdate: "agent_message_chunk",
    messageId: AGENT_MESSAGE_ID,
    content: { type: "text", text },
  });
}

function finishPrompt(session, promptId, result) {
  if (
    !session.currentPrompt ||
    session.currentPrompt.id !== promptId ||
    session.currentPrompt.finished
  ) {
    return;
  }

  session.currentPrompt.finished = true;
  respond(promptId, result);
  session.currentPrompt = null;
}

function killChild(session) {
  if (session.child && session.child.exitCode === null) {
    try {
      session.child.kill("SIGKILL");
    } catch {
      // Proses turunan sudah berhenti.
    }
  }

  session.child = null;
}

function killAllChildren() {
  for (const session of sessions.values()) {
    killChild(session);
  }
}

function spawnChild(session) {
  if (!options.spawnChild || session.child) return;

  const child = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { stdio: "ignore" },
  );

  session.child = child;

  if (options.childPidFile) {
    fs.writeFileSync(
      options.childPidFile,
      JSON.stringify({ parent: process.pid, child: child.pid }),
      "utf8",
    );
  }
}

function cancelSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.cancelled = true;
  killChild(session);

  if (session.pendingPermission) {
    const pending = session.pendingPermission;
    session.pendingPermission = null;
    pending.resolve({ outcome: "cancelled" });
  }

  if (session.currentPrompt) {
    finishPrompt(session, session.currentPrompt.id, {
      stopReason: "cancelled",
    });
  }
}

async function sendStreamingChunks(session, chunks) {
  for (let index = 0; index < chunks.length; index += 1) {
    if (session.cancelled) return false;
    if (index > 0) await sleep(options.delayMs);
    if (session.cancelled) return false;
    streamChunk(session.id, chunks[index]);
  }

  return !session.cancelled;
}

async function runStreamScenario(session, promptId) {
  const completed = await sendStreamingChunks(session, [
    "Halo",
    " dari",
    " mock",
    " ACP.",
  ]);

  if (completed && !session.cancelled) {
    finishPrompt(session, promptId, { stopReason: "end_turn" });
  }
}

function requestPermission(session) {
  const permissionId = nextRequestId;
  nextRequestId += 1;

  return new Promise((resolve) => {
    session.pendingPermission = { id: permissionId, resolve };

    send({
      jsonrpc: "2.0",
      id: permissionId,
      method: "session/request_permission",
      params: {
        sessionId: session.id,
        toolCall: {
          toolCallId: TOOL_CALL_ID,
          title: "Menulis file contoh",
          kind: "edit",
          status: "pending",
        },
        options: [
          {
            optionId: "allow",
            name: "Izinkan sekali",
            kind: "allow_once",
          },
          {
            optionId: "deny",
            name: "Tolak",
            kind: "reject_once",
          },
        ],
      },
    });
  });
}

async function runPermissionScenario(session, promptId, promptText) {
  const beganStreaming = await sendStreamingChunks(session, [
    "Saya perlu ",
    "menulis file uji.",
  ]);

  if (!beganStreaming || session.cancelled) return;

  notify(session.id, {
    sessionUpdate: "tool_call",
    toolCallId: TOOL_CALL_ID,
    title: "Menulis file contoh",
    name: "write_file",
    kind: "edit",
    status: "pending",
  });

  const outcome = await requestPermission(session);
  session.pendingPermission = null;

  if (session.cancelled || outcome.outcome === "cancelled") {
    if (!session.cancelled) {
      finishPrompt(session, promptId, { stopReason: "cancelled" });
    }
    return;
  }

  if (outcome.outcome === "selected" && outcome.optionId === "allow") {
    notify(session.id, {
      sessionUpdate: "tool_call_update",
      toolCallId: TOOL_CALL_ID,
      status: "in_progress",
    });

    const filePath = path.join(session.cwd, options.fileName);
    const content = `approved:${session.id}:${promptText}\n`;
    fs.writeFileSync(filePath, content, "utf8");

    notify(session.id, {
      sessionUpdate: "tool_call_update",
      toolCallId: TOOL_CALL_ID,
      status: "completed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: `File ditulis ke ${options.fileName}`,
          },
        },
      ],
    });

    await sendStreamingChunks(session, [" File", " berhasil", " ditulis."]);

    if (!session.cancelled) {
      finishPrompt(session, promptId, { stopReason: "end_turn" });
    }
    return;
  }

  notify(session.id, {
    sessionUpdate: "tool_call_update",
    toolCallId: TOOL_CALL_ID,
    status: "failed",
    content: [
      {
        type: "content",
        content: { type: "text", text: "Izin ditolak pengguna." },
      },
    ],
  });

  await sendStreamingChunks(session, [
    " Izin",
    " ditolak;",
    " file tidak ditulis.",
  ]);

  if (!session.cancelled) {
    finishPrompt(session, promptId, { stopReason: "end_turn" });
  }
}

async function runPrompt(session, promptId, promptText) {
  try {
    spawnChild(session);

    if (options.scenario === "permission") {
      await runPermissionScenario(session, promptId, promptText);
      return;
    }

    await runStreamScenario(session, promptId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`Prompt gagal: ${message}`);

    if (!session.cancelled && session.currentPrompt?.id === promptId) {
      session.currentPrompt.finished = true;
      session.currentPrompt = null;
      respondError(promptId, -32603, `Mock agent error: ${message}`);
    }
  }
}

function promptTextFrom(params) {
  if (!Array.isArray(params.prompt)) return "";
  return params.prompt
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join(" ");
}

function handlePermissionResponse(message) {
  for (const session of sessions.values()) {
    if (session.pendingPermission?.id !== message.id) continue;

    const pending = session.pendingPermission;
    session.pendingPermission = null;

    if (message.error) {
      pending.resolve({ outcome: "cancelled" });
      return;
    }

    const outcome = message.result?.outcome;
    pending.resolve(
      outcome && typeof outcome === "object"
        ? outcome
        : { outcome: "cancelled" },
    );
    return;
  }
}

function handleRequest(message) {
  const method = message.method;

  if (method === "initialize") {
    respond(message.id, {
      protocolVersion: 1,
      agentCapabilities: {
        promptCapabilities: {
          image: false,
          embeddedContext: false,
        },
      },
      agentInfo: {
        name: "Mock ACP Agent",
        title: "Mock ACP Agent",
        version: MOCK_VERSION,
      },
      authMethods: [],
    });
    return;
  }

  if (method === "session/new") {
    const cwd = message.params?.cwd;

    if (typeof cwd !== "string" || !path.isAbsolute(cwd)) {
      respondError(message.id, -32602, "cwd harus path absolut.");
      return;
    }

    try {
      if (!fs.statSync(cwd).isDirectory()) {
        respondError(message.id, -32602, "cwd harus berupa folder.");
        return;
      }
    } catch {
      respondError(message.id, -32602, "cwd tidak ditemukan.");
      return;
    }

    const sessionId = `mock-session-${nextSessionNumber}`;
    nextSessionNumber += 1;
    sessions.set(sessionId, {
      id: sessionId,
      cwd,
      cancelled: false,
      currentPrompt: null,
      pendingPermission: null,
      child: null,
    });

    respond(message.id, { sessionId });
    return;
  }

  if (method === "session/prompt") {
    const session = sessions.get(message.params?.sessionId);

    if (!session) {
      respondError(message.id, -32602, "Sesi tidak ditemukan.");
      return;
    }

    if (session.currentPrompt) {
      respondError(message.id, -32603, "Masih ada prompt yang berjalan.");
      return;
    }

    const text = promptTextFrom(message.params);
    session.cancelled = false;
    session.currentPrompt = {
      id: message.id,
      text,
      finished: false,
    };

    void runPrompt(session, message.id, text);
    return;
  }

  if (method === "session/cancel") {
    cancelSession(message.params?.sessionId);
    return;
  }

  if (message.id !== undefined) {
    respondError(message.id, -32601, `Metode tidak dikenal: ${method}`);
  }
}

function handleMessage(message) {
  if (typeof message !== "object" || message === null) {
    logError("Pesan JSON-RPC harus berupa objek.");
    return;
  }

  if (typeof message.method === "string") {
    handleRequest(message);
    return;
  }

  if (message.id !== undefined) {
    handlePermissionResponse(message);
  }
}

function handleLine(line) {
  let message;

  try {
    message = JSON.parse(line);
  } catch {
    send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "JSON tidak valid." },
    });
    process.exitCode = 1;
    return;
  }

  handleMessage(message);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;

  for (;;) {
    const newline = buffer.indexOf("\n");
    if (newline === -1) break;

    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) handleLine(line);
  }
});

process.stdin.on("end", () => {
  killAllChildren();
  process.exit(0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    killAllChildren();
    process.exit(0);
  });
}

process.on("exit", () => {
  if (!shuttingDown) {
    shuttingDown = true;
    killAllChildren();
  }
});
