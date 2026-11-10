import { spawn, type ChildProcess } from "node:child_process";

export type AgentUpdate = {
  sessionUpdate: string;
  content?: { type?: string; text?: string };
  toolCallId?: string;
  status?: string;
  [key: string]: unknown;
};

export type PermissionRequest = {
  id: number;
  params: {
    sessionId: string;
    toolCall?: { toolCallId?: string; title?: string; kind?: string };
    options: Array<{ optionId: string; name: string; kind: string }>;
  };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
};

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class AcpTestClient {
  readonly child: ChildProcess;
  readonly updates: AgentUpdate[] = [];
  stderr = "";

  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private permissionQueue: PermissionRequest[] = [];
  private exited = false;

  constructor(command: string, args: string[], cwd: string) {
    this.child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });

    this.child.stdout?.setEncoding("utf8");
    this.child.stdout?.on("data", (chunk: string) => {
      this.handleData(chunk);
    });
    this.child.stderr?.on("data", (chunk: Buffer) => {
      this.stderr += chunk.toString();
    });
    this.child.once("exit", () => {
      this.exited = true;
      this.rejectPending(
        new Error(`Mock agent berhenti. stderr: ${this.stderr}`),
      );
    });
  }

  private handleData(chunk: string) {
    this.buffer += chunk;

    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline === -1) break;

      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;

      let message: JsonRpcMessage;
      try {
        message = JSON.parse(line) as JsonRpcMessage;
      } catch {
        throw new Error(`Mock mengirim JSON tidak valid: ${line}`);
      }

      this.handleMessage(message);
    }
  }

  private handleMessage(message: JsonRpcMessage) {
    if (message.method === "session/update") {
      const params = message.params as { update?: AgentUpdate } | undefined;
      if (params?.update) this.updates.push(params.update);
      return;
    }

    if (message.method === "session/request_permission") {
      const request = {
        id: message.id as number,
        params: message.params as PermissionRequest["params"],
      };
      this.permissionQueue.push(request);
      return;
    }

    if (message.id !== undefined && typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) return;

      this.pending.delete(message.id);
      clearTimeout(pending.timer);

      if (message.error) {
        pending.reject(
          new Error(
            `JSON-RPC error ${message.error.code}: ${message.error.message}`,
          ),
        );
      } else {
        pending.resolve(message.result);
      }
    }
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private write(message: unknown) {
    this.child.stdin?.write(`${JSON.stringify(message)}\n`);
  }

  request<T = unknown>(method: string, params: unknown): Promise<T> {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout menunggu respons ${method}.`));
      }, 5000);

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });

      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params: unknown) {
    this.write({ jsonrpc: "2.0", method, params });
  }

  cancel(sessionId: string) {
    this.notify("session/cancel", { sessionId });
  }

  respondPermission(
    id: number,
    outcome:
      | { outcome: "selected"; optionId: string }
      | { outcome: "cancelled" },
  ) {
    this.write({
      jsonrpc: "2.0",
      id,
      result: { outcome },
    });
  }

  async waitUntil(
    label: string,
    check: () => boolean,
    timeoutMs = 5000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (check()) return;
      await delay(20);
    }

    throw new Error(`Timeout menunggu ${label}. stderr: ${this.stderr}`);
  }

  async waitForPermission(
    timeoutMs = 5000,
  ): Promise<PermissionRequest> {
    await this.waitUntil(
      "permintaan izin",
      () => this.permissionQueue.length > 0,
      timeoutMs,
    );

    return this.permissionQueue.shift() as PermissionRequest;
  }

  async waitForUpdate(
    predicate: (update: AgentUpdate) => boolean,
    timeoutMs = 5000,
  ): Promise<AgentUpdate> {
    await this.waitUntil(
      "session update",
      () => this.updates.some(predicate),
      timeoutMs,
    );

    return this.updates.find(predicate) as AgentUpdate;
  }

  async close(): Promise<void> {
    if (this.exited) return;

    const pid = this.child.pid;

    if (pid && process.platform !== "win32") {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        this.child.kill("SIGKILL");
      }
    } else {
      this.child.kill("SIGKILL");
    }

    if (this.exited) return;

    await Promise.race([
      new Promise<void>((resolve) => {
        this.child.once("exit", () => resolve());
      }),
      delay(3000),
    ]);
  }
}
