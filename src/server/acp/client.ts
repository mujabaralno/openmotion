import type { ChildProcess } from "node:child_process";
import { executionOptions, parseConfigOptions, parseLegacyModels, type AgentConfigOption, type AgentSelector, type AgentExecutionOptions } from './configuration.ts';
import {
  getAgentProcess,
  startAgentSession,
  stopAgentSession,
} from "../agents/registry.ts";
import {
  AcpConnectionClosedError,
  AcpJsonRpcConnection,
  AcpJsonRpcError,
  AcpRequestTimeoutError,
} from "./jsonrpc.ts";
import type {
  AcpPermissionDecision,
  AcpPermissionOption,
  AcpPermissionRequest,
  AcpPromptResult,
  AcpUpdate,
} from "./types.ts";

export type AcpClientErrorCode =
  | "closed"
  | "start-failed"
  | "unsupported-version"
  | "invalid-response"
  | "timeout"
  | "connection-lost"
  | "agent-error"
  | "not-started"
  | "prompt-failed";

export class AcpClientError extends Error {
  readonly code: AcpClientErrorCode;

  constructor(code: AcpClientErrorCode, message: string) {
    super(message);
    this.name = "AcpClientError";
    this.code = code;
  }
}

export type AcpSessionOptions = {
  sessionId: string;
  agentId: string;
  episodeSlug: string;
  workspaceRoot?: string;
  workingDirectory?: 'episode' | 'remotion';
  clientInfo?: {
    name: string;
    title?: string;
    version: string;
  };
  initializeTimeoutMs?: number;
  promptTimeoutMs?: number;
  onUpdate?: (update: AcpUpdate) => void;
  onPermissionRequest?: (
    request: AcpPermissionRequest,
  ) => AcpPermissionDecision | Promise<AcpPermissionDecision>;
  onLog?: (line: string) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toClientError(
  error: unknown,
  phase: "start" | "prompt",
): AcpClientError {
  if (error instanceof AcpClientError) return error;

  if (error instanceof AcpRequestTimeoutError) {
    return new AcpClientError("timeout", error.message);
  }

  if (error instanceof AcpConnectionClosedError) {
    return new AcpClientError("connection-lost", error.message);
  }

  if (error instanceof AcpJsonRpcError) {
    const loginHint = /auth|login|sign[ -]?in/i.test(error.message)
      ? " Jalankan login agen di terminal, lalu coba lagi."
      : "";

    return new AcpClientError(
      "agent-error",
      `Agen mengembalikan error: ${error.message}.${loginHint}`,
    );
  }

  const message = error instanceof Error ? error.message : String(error);

  return new AcpClientError(
    phase === "start" ? "start-failed" : "prompt-failed",
    message,
  );
}

function parsePermissionOptions(value: unknown): AcpPermissionOption[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AcpClientError(
      "invalid-response",
      "Permintaan izin tidak memiliki options yang valid.",
    );
  }

  return value.map((option, index) => {
    if (
      !isRecord(option) ||
      typeof option.optionId !== "string" ||
      !option.optionId ||
      typeof option.name !== "string" ||
      typeof option.kind !== "string"
    ) {
      throw new AcpClientError(
        "invalid-response",
        `Option izin ke-${index} tidak valid.`,
      );
    }

    return {
      optionId: option.optionId,
      name: option.name,
      kind: option.kind,
    };
  });
}

function waitForChildExit(
  child: ChildProcess,
  timeoutMs = 2000,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return Promise.race([
    new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    }),
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
}

export class AcpSession {
  private readonly options: AcpSessionOptions;
  private connection: AcpJsonRpcConnection | null = null;
  private appSessionId: string | null = null;
  private acpSessionId: string | null = null;
  private updates: AcpUpdate[] = [];
  private permissionWaits = 0;
  private configOptions: AgentConfigOption[] = [];
  private legacyModels: AgentSelector | null = null;
  private started = false;
  private closed = false;
  private unsubscribeNotification: (() => void) | null = null;
  private unsubscribePermission: (() => void) | null = null;

  constructor(options: AcpSessionOptions) {
    this.options = options;
  }

  get applicationSessionId(): string | null {
    return this.appSessionId;
  }

  get remoteSessionId(): string | null {
    return this.acpSessionId;
  }

  get configuration(): AgentExecutionOptions {
    return structuredClone(executionOptions(this.configOptions, this.legacyModels));
  }

  async configure(input: { modelId?: string | null; effort?: string | null }): Promise<void> {
    if (!this.connection || !this.acpSessionId) throw new AcpClientError('not-started', 'Sesi ACP belum dimulai.');
    const apply = async (kind: 'model' | 'effort', value: string) => {
      const option = this.configuration[kind];
      const label = kind === 'model' ? 'Model' : 'Effort';
      if (!option) throw new AcpClientError('invalid-response', `${label} tidak dapat diatur melalui ACP agen ini. Pilih agen yang mendukungnya.`);
      if (!option.options.some(choice => choice.value === value)) throw new AcpClientError('invalid-response', `${label} "${value}" tidak tersedia untuk agen/model ini. Muat ulang pilihan.`);
      if (option.currentValue === value) return;
      if (kind === 'model' && option.id === 'legacy-model') {
        await this.connection!.request('session/set_model', { sessionId: this.acpSessionId, modelId: value }, { timeoutMs: this.options.initializeTimeoutMs ?? 15000 });
        this.legacyModels!.currentValue = value;
      } else {
        const result = await this.connection!.request<unknown>('session/set_config_option', { sessionId: this.acpSessionId, configId: option.id, value }, { timeoutMs: this.options.initializeTimeoutMs ?? 15000 });
        if (isRecord(result) && Array.isArray(result.configOptions)) this.configOptions = parseConfigOptions(result.configOptions);
        if (this.configuration[kind]?.currentValue !== value) throw new AcpClientError('invalid-response', `Agen tidak mengonfirmasi perubahan ${label.toLowerCase()}. Prompt belum dikirim.`);
      }
    };
    // Effort choices may change after switching the model.
    if (input.modelId) await apply('model', input.modelId);
    if (input.effort) await apply('effort', input.effort);
  }

  private log(line: string) {
    this.options.onLog?.(line);
  }

  private handleNotification(method: string, params: unknown) {
    if (method !== "session/update") return;

    const otherSessionId = isRecord(params) && typeof params.sessionId === "string"
      ? params.sessionId
      : "tidak diketahui";

    if (!isRecord(params) || params.sessionId !== this.acpSessionId) {
      this.log(
        `[acp] Mengabaikan update untuk sesi lain: ${otherSessionId}`,
      );
      return;
    }

    const update = params.update;

    if (!isRecord(update) || typeof update.sessionUpdate !== "string") {
      throw new AcpClientError(
        "invalid-response",
        "Agen mengirim session/update yang tidak valid.",
      );
    }

    const typedUpdate = update as AcpUpdate;
    if (update.sessionUpdate === 'config_option_update' && Array.isArray(update.configOptions)) this.configOptions = parseConfigOptions(update.configOptions);
    this.updates.push(typedUpdate);

    try {
      this.options.onUpdate?.(typedUpdate);
    } catch (error) {
      this.log(
        `[acp] Callback update gagal: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handlePermission(
    params: unknown,
  ): Promise<AcpPermissionDecision> {
    if (!isRecord(params) || params.sessionId !== this.acpSessionId) {
      throw new AcpClientError(
        "invalid-response",
        "Permintaan izin untuk sesi yang tidak dikenal.",
      );
    }

    const options = parsePermissionOptions(params.options);
    const toolCall = isRecord(params.toolCall)
      ? {
          rawInput: params.toolCall.rawInput,
          locations: params.toolCall.locations,
          toolCallId:
            typeof params.toolCall.toolCallId === "string"
              ? params.toolCall.toolCallId
              : undefined,
          title:
            typeof params.toolCall.title === "string"
              ? params.toolCall.title
              : undefined,
          kind:
            typeof params.toolCall.kind === "string"
              ? params.toolCall.kind
              : undefined,
        }
      : undefined;

    const request: AcpPermissionRequest = {
      sessionId: params.sessionId as string,
      toolCall,
      options,
    };

    if (this.options.onPermissionRequest) {
      let decision: AcpPermissionDecision;

      try {
        this.permissionWaits += 1;
        this.connection?.pauseTimeout("session/prompt");
        try {
          decision = await this.options.onPermissionRequest(request);
        } finally {
          this.permissionWaits -= 1;
          if (this.permissionWaits === 0) this.connection?.resumeTimeout("session/prompt");
        }
      } catch (error) {
        this.log(
          `[acp] Handler izin gagal; permintaan ditolak: ${error instanceof Error ? error.message : String(error)}`,
        );
        return { outcome: "cancelled" };
      }

      if (decision.outcome === "selected") {
        if (!options.some((option) => option.optionId === decision.optionId)) {
          this.log(
            `[acp] Handler memilih optionId yang tidak ada: ${decision.optionId}`,
          );
          return { outcome: "cancelled" };
        }

        return decision;
      }

      return decision;
    }

    const rejectOption = options.find((option) => option.kind === "reject_once");

    this.log(
      "[acp] Permintaan izin ditolak otomatis karena belum ada handler izin.",
    );

    return rejectOption
      ? { outcome: "selected", optionId: rejectOption.optionId }
      : { outcome: "cancelled" };
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.closed) {
      throw new AcpClientError("closed", "Sesi ACP sudah ditutup.");
    }

    try {
      const registrySession = startAgentSession({
        sessionId: this.options.sessionId,
        agentId: this.options.agentId,
        episodeSlug: this.options.episodeSlug,
        workspaceRoot: this.options.workspaceRoot,
        stdio: "pipe",
        workingDirectory: this.options.workingDirectory,
      });

      this.appSessionId = registrySession.sessionId;

      const child = getAgentProcess(this.appSessionId);

      if (!child) {
        throw new AcpClientError(
          "start-failed",
          "Proses agen tidak tersedia setelah registry menjalankannya.",
        );
      }

      this.connection = new AcpJsonRpcConnection(child, {
        onLog: (line) => this.log(`[agent] ${line}`),
      });

      const initializeTimeoutMs =
        this.options.initializeTimeoutMs ?? 15000;
      const initialized = await this.connection.request<unknown>(
        "initialize",
        {
          protocolVersion: 1,
          clientCapabilities: {},
          clientInfo: this.options.clientInfo ?? {
            name: "workflow-studio",
            title: "Workflow Studio",
            version: "0.1.0",
          },
        },
        { timeoutMs: initializeTimeoutMs },
      );

      if (
        !isRecord(initialized) ||
        initialized.protocolVersion !== 1
      ) {
        throw new AcpClientError(
          "unsupported-version",
          `Versi ACP agen tidak didukung: ${String(
            isRecord(initialized) ? initialized.protocolVersion : "tidak diketahui",
          )}. Aplikasi memakai ACP v1.`,
        );
      }

      const sessionResult = await this.connection.request<unknown>(
        "session/new",
        {
          cwd: registrySession.cwd,
          mcpServers: [],
        },
        { timeoutMs: initializeTimeoutMs },
      );

      if (
        !isRecord(sessionResult) ||
        typeof sessionResult.sessionId !== "string" ||
        !sessionResult.sessionId
      ) {
        throw new AcpClientError(
          "invalid-response",
          "Agen tidak mengembalikan sessionId ACP yang valid.",
        );
      }

      this.acpSessionId = sessionResult.sessionId;
      this.configOptions = parseConfigOptions(sessionResult.configOptions);
      this.legacyModels = parseLegacyModels(sessionResult.models);
      this.unsubscribeNotification = this.connection.onNotification(
        (method, params) => this.handleNotification(method, params),
      );
      this.unsubscribePermission = this.connection.onRequest(
        "session/request_permission",
        async (params) => ({ outcome: await this.handlePermission(params) }),
      );
      // Prefer an explicit manual-permission mode when the agent advertises one.
      const modes = isRecord(sessionResult.modes) ? sessionResult.modes : null;
      const available = modes && Array.isArray(modes.availableModes) ? modes.availableModes : [];
      const manualMode = ['default', 'workspace-write'].find(id => available.some((mode: unknown) => isRecord(mode) && mode.id === id));
      if (manualMode) {
        await this.connection.request("session/set_mode", { sessionId: this.acpSessionId, modeId: manualMode }, { timeoutMs: initializeTimeoutMs });
      }
      this.started = true;
    } catch (error) {
      await this.close();
      throw toClientError(error, "start");
    }
  }

  async prompt(text: string): Promise<AcpPromptResult> {
    if (!this.started || !this.connection || !this.acpSessionId) {
      throw new AcpClientError(
        "not-started",
        "Sesi ACP belum dimulai atau sudah ditutup.",
      );
    }

    this.updates = [];

    try {
      const result = await this.connection.request<unknown>(
        "session/prompt",
        {
          sessionId: this.acpSessionId,
          prompt: [{ type: "text", text }],
        },
        { timeoutMs: this.options.promptTimeoutMs ?? 30 * 60 * 1000 },
      );

      if (
        !isRecord(result) ||
        typeof result.stopReason !== "string" ||
        !result.stopReason
      ) {
        throw new AcpClientError(
          "invalid-response",
          "Agen tidak mengembalikan stopReason yang valid.",
        );
      }

      return {
        appSessionId: this.appSessionId as string,
        acpSessionId: this.acpSessionId,
        stopReason: result.stopReason,
        updates: [...this.updates],
      };
    } catch (error) {
      if (error instanceof AcpRequestTimeoutError) {
        this.connection.notify("session/cancel", {
          sessionId: this.acpSessionId,
        });
      }

      throw toClientError(error, "prompt");
    }
  }

  cancel(): void {
    if (!this.started || !this.connection || !this.acpSessionId) return;

    this.connection.notify("session/cancel", {
      sessionId: this.acpSessionId,
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    this.unsubscribeNotification?.();
    this.unsubscribePermission?.();
    this.unsubscribeNotification = null;
    this.unsubscribePermission = null;
    this.connection?.dispose();
    this.connection = null;

    if (this.appSessionId) {
      try {
        stopAgentSession(this.appSessionId, { force: true });
      } catch {
        // Pembersihan registry tidak boleh menggagalkan penutupan.
      }

      const child = getAgentProcess(this.appSessionId);
      if (child) {
        await waitForChildExit(child);
      }
    }

    this.started = false;
  }
}

export type RunAcpPromptOptions = AcpSessionOptions & {
  prompt: string;
};

export async function runAcpPrompt(
  options: RunAcpPromptOptions,
): Promise<AcpPromptResult> {
  const session = new AcpSession(options);

  try {
    await session.start();
    return await session.prompt(options.prompt);
  } finally {
    await session.close();
  }
}
