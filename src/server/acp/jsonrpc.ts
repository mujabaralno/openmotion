import type { ChildProcess } from "node:child_process";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type RequestHandler = (params: unknown) => Promise<unknown> | unknown;
type NotificationHandler = (method: string, params: unknown) => void;
type ExitHandler = (error: Error) => void;

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

export class AcpJsonRpcError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "AcpJsonRpcError";
    this.code = code;
    this.data = data;
  }
}

export class AcpRequestTimeoutError extends Error {
  readonly method: string;

  constructor(method: string, timeoutMs: number) {
    super(`Timeout menunggu respons ${method} setelah ${timeoutMs} ms.`);
    this.name = "AcpRequestTimeoutError";
    this.method = method;
  }
}

export class AcpConnectionClosedError extends Error {
  constructor(message = "Koneksi ACP ditutup.") {
    super(message);
    this.name = "AcpConnectionClosedError";
  }
}

export class AcpJsonRpcConnection {
  readonly child: ChildProcess;

  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private requestHandlers = new Map<string, RequestHandler>();
  private notificationHandlers = new Set<NotificationHandler>();
  private exitHandlers = new Set<ExitHandler>();
  private closed = false;
  private readonly onLog: (line: string) => void;
  private readonly onStdoutData: (chunk: string) => void;
  private readonly onStderrData: (chunk: Buffer) => void;
  private readonly onChildError: (error: Error) => void;
  private readonly onChildExit: (
    code: number | null,
    signal: NodeJS.Signals | null,
  ) => void;

  constructor(
    child: ChildProcess,
    options: { onLog?: (line: string) => void } = {},
  ) {
    if (!child.stdin || !child.stdout) {
      throw new AcpConnectionClosedError(
        "Proses agen tidak menyediakan stdin/stdout untuk ACP.",
      );
    }

    this.child = child;
    this.onLog = options.onLog ?? (() => {});

    this.onStdoutData = (chunk) => {
      this.handleData(chunk);
    };
    this.onStderrData = (chunk) => {
      const text = chunk.toString();
      for (const line of text.split(/\r?\n/)) {
        if (line) this.onLog(line);
      }
    };
    this.onChildError = (error) => {
      this.fail(error);
    };
    this.onChildExit = (code, signal) => {
      this.fail(
        new AcpConnectionClosedError(
          `Proses agen berhenti (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
        ),
      );
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", this.onStdoutData);
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", this.onStderrData);
    child.once("error", this.onChildError);
    child.once("exit", this.onChildExit);
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
        this.fail(
          new AcpConnectionClosedError(
            `Agen mengirim JSON yang tidak valid: ${line.slice(0, 200)}`,
          ),
        );
        return;
      }

      this.handleMessage(message);
    }
  }

  private handleMessage(message: JsonRpcMessage) {
    if (typeof message.method === "string") {
      if (message.id !== undefined && message.id !== null) {
        this.handleRequest(message.id as number, message.method, message.params);
      } else {
        for (const handler of this.notificationHandlers) {
          try {
            handler(message.method, message.params);
          } catch (error) {
            this.fail(error instanceof Error ? error : new Error(String(error)));
            return;
          }
        }
      }
      return;
    }

    if (typeof message.id !== "number") return;

    const pending = this.pending.get(message.id);
    if (!pending) return;

    this.pending.delete(message.id);
    clearTimeout(pending.timer);

    if (message.error) {
      pending.reject(
        new AcpJsonRpcError(
          message.error.code ?? -32603,
          message.error.message ?? "Agen mengembalikan error.",
          message.error.data,
        ),
      );
    } else {
      pending.resolve(message.result);
    }
  }

  private handleRequest(id: number, method: string, params: unknown) {
    const handler = this.requestHandlers.get(method);

    if (!handler) {
      this.respondError(id, -32601, `Metode tidak dikenal: ${method}`);
      return;
    }

    Promise.resolve()
      .then(() => handler(params))
      .then((result) => {
        this.respond(id, result);
      })
      .catch((error: unknown) => {
        this.respondError(
          id,
          -32603,
          error instanceof Error ? error.message : String(error),
        );
      });
  }

  private write(message: unknown) {
    if (this.closed) return;
    this.child.stdin?.write(`${JSON.stringify(message)}\n`);
  }

  private respond(id: number, result: unknown) {
    this.write({ jsonrpc: "2.0", id, result });
  }

  private respondError(id: number, code: number, message: string) {
    this.write({ jsonrpc: "2.0", id, error: { code, message } });
  }

  private fail(error: Error) {
    if (this.closed) return;
    this.closed = true;

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();

    for (const handler of this.exitHandlers) {
      try {
        handler(error);
      } catch {
        // Callback keluar tidak boleh menggagalkan pembersihan.
      }
    }
  }

  request<T = unknown>(
    method: string,
    params: unknown,
    options: { timeoutMs?: number } = {},
  ): Promise<T> {
    if (this.closed) {
      return Promise.reject(new AcpConnectionClosedError());
    }

    const timeoutMs = options.timeoutMs ?? 30000;
    const id = this.nextId;
    this.nextId += 1;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new AcpRequestTimeoutError(method, timeoutMs));
      }, timeoutMs);

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

  onRequest(method: string, handler: RequestHandler): () => void {
    this.requestHandlers.set(method, handler);
    return () => {
      if (this.requestHandlers.get(method) === handler) {
        this.requestHandlers.delete(method);
      }
    };
  }

  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => {
      this.notificationHandlers.delete(handler);
    };
  }

  onExit(handler: ExitHandler): () => void {
    this.exitHandlers.add(handler);
    return () => {
      this.exitHandlers.delete(handler);
    };
  }

  dispose() {
    this.fail(new AcpConnectionClosedError("Koneksi ACP ditutup oleh aplikasi."));
    this.child.stdout?.removeListener("data", this.onStdoutData);
    this.child.stderr?.removeListener("data", this.onStderrData);
    this.child.removeListener("error", this.onChildError);
    this.child.removeListener("exit", this.onChildExit);
  }
}
