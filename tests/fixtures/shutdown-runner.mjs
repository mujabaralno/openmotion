import fs from "node:fs";
import {
  getAgentSession,
  installAgentShutdownHandlers,
  startAgentSession,
} from "../../src/server/agents/registry.ts";

const workspaceRoot = process.env.WORKSPACE_ROOT;
const readyFile = process.env.READY_FILE;

if (!workspaceRoot || !readyFile) {
  process.exit(2);
}

installAgentShutdownHandlers();

try {
  startAgentSession({
    sessionId: "shutdown-test",
    agentId: "stub",
    episodeSlug: "episode-a",
    workspaceRoot,
  });

  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const session = getAgentSession("shutdown-test");

    if (session?.status === "running" && session.pid) {
      fs.writeFileSync(
        readyFile,
        JSON.stringify({ agentPid: session.pid, cwd: session.cwd }),
        "utf8",
      );
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
} catch (error) {
  fs.writeFileSync(
    readyFile,
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }),
    "utf8",
  );
  process.exit(1);
}

setInterval(() => {}, 1000);
