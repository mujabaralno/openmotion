"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertIcon,
  CheckIcon,
  ShieldIcon,
  SparkIcon,
  TerminalIcon,
  WrenchIcon,
  XIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Switch } from "@/components/ui/switch";
import {
  Trace,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { STEP_LABELS } from "@/lib/episode-labels";
import type { AcpUpdate } from "@/server/acp/types";
import type {
  AgentStreamEvent,
  AgentStreamStatus,
  PermissionRecord,
} from "@/server/agent-streams/types";
import type { StepKind } from "@/server/db";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type ToolEntry = {
  id: string;
  title: string;
  status: string;
  kind?: string;
  name?: string;
};

type ConnectionState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "idle"
  | "done"
  | "error";

const SESSION_LABELS: Record<AgentStreamStatus, string> = {
  idle: "Belum ada sesi",
  running: "Berjalan",
  completed: "Selesai",
  failed: "Gagal",
};

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connecting: "Memuat riwayat",
  open: "Tersambung",
  reconnecting: "Menyambung ulang",
  idle: "Tidak ada sesi",
  done: "Selesai",
  error: "Koneksi gagal",
};

type StatusTone = "accent" | "success" | "danger" | "warning" | "muted";

const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  accent: "border-primary/30 bg-primary/10 text-primary",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  muted: "border-white/10 bg-white/[0.03] text-muted-foreground",
};

function connectionTone(state: ConnectionState): StatusTone {
  if (state === "error") return "danger";
  if (state === "open") return "accent";
  if (state === "connecting" || state === "reconnecting") return "warning";
  if (state === "done") return "success";
  return "muted";
}

function sessionTone(status: AgentStreamStatus): StatusTone {
  if (status === "failed") return "danger";
  if (status === "completed") return "success";
  if (status === "running") return "accent";
  return "muted";
}

function StatusPill({
  tone,
  children,
  pulse = false,
}: {
  tone: StatusTone;
  children: ReactNode;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em]",
        STATUS_TONE_CLASSES[tone],
      )}
    >
      {pulse ? (
        <span className="animate-soft-pulse size-1 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  );
}

function toolStatusLabel(status: string): string {
  if (status === "pending") return "Menunggu";
  if (status === "in_progress") return "Berjalan";
  if (status === "completed") return "Selesai";
  if (status === "failed") return "Gagal";
  return status;
}

function traceStatus(
  status: string,
): "running" | "error" | "pending" | undefined {
  if (status === "failed") return "error";
  if (status === "pending") return "pending";
  if (status === "in_progress") return "running";
  return undefined;
}

function permissionStatusLabel(permission: PermissionRecord): string {
  if (permission.status === "pending") return "Menunggu keputusan";
  if (permission.status === "approved") {
    return permission.decisionSource === "auto"
      ? "Disetujui otomatis"
      : "Disetujui";
  }
  if (permission.status === "rejected") return "Ditolak";
  if (permission.status === "expired") return "Kedaluwarsa";
  return "Gagal";
}

function permissionTone(permission: PermissionRecord): StatusTone {
  if (permission.status === "approved") return "success";
  if (permission.status === "rejected" || permission.status === "failed") {
    return "danger";
  }
  if (permission.status === "pending") return "warning";
  return "muted";
}

function InlineError({ message }: { message: string }) {
  return (
    <div
      className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
      role="alert"
    >
      <AlertIcon className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function ConsoleEmptyState({
  connection,
}: {
  connection: ConnectionState;
}) {
  if (connection === "connecting") {
    return (
      <div className="flex min-h-[18rem] flex-col justify-center gap-3 px-1">
        <span className="h-3 w-28 animate-pulse rounded-full bg-white/10" />
        <span className="h-3 w-4/5 animate-pulse rounded-full bg-white/[0.06]" />
        <span className="h-3 w-3/5 animate-pulse rounded-full bg-white/[0.05]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-primary">
        <TerminalIcon className="size-5" />
      </span>
      <p className="mt-4 text-sm font-medium text-foreground">
        Console siap menerima sesi.
      </p>
      <p className="mt-1.5 max-w-[36ch] text-xs leading-relaxed text-muted-foreground">
        {connection === "reconnecting"
          ? "Menyambung ulang ke riwayat sesi..."
          : "Pilih agen dan kirim prompt. Riwayat sesi aktif akan muncul di sini."}
      </p>
    </div>
  );
}

export function AgentStreamView({
  episodeSlug,
  kind,
}: {
  episodeSlug: string;
  kind: StepKind;
}) {
  const [connection, setConnection] =
    useState<ConnectionState>("connecting");
  const [sessionStatus, setSessionStatus] =
    useState<AgentStreamStatus>("idle");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<
    Record<string, PermissionRecord>
  >({});
  const [autoApprove, setAutoApprove] = useState(false);
  const [autoPending, setAutoPending] = useState(false);
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});

  const sourceRef = useRef<EventSource | null>(null);
  const seenRef = useRef(new Set<string>());
  const attemptRef = useRef<string | null>(null);
  const terminalRef = useRef(false);

  useEffect(() => {
    const source = new EventSource(
      `/api/episodes/${encodeURIComponent(episodeSlug)}/steps/${kind}/stream`,
    );
    sourceRef.current = source;

    const ensureAttempt = (nextAttemptId: string) => {
      if (!nextAttemptId || attemptRef.current === nextAttemptId) return;

      attemptRef.current = nextAttemptId;
      seenRef.current.clear();
      setAttemptId(nextAttemptId);
      setMessages([]);
      setTools([]);
      setPermissions({});
      setAutoApprove(false);
      setError(null);
      setSessionStatus("running");
    };

    const applyUpdate = (update: AcpUpdate) => {
      if (update.sessionUpdate === "agent_message_chunk") {
        const text = update.content?.text;
        if (!text) return;

        const messageId =
          typeof update.messageId === "string"
            ? update.messageId
            : "default";
        const id = `${attemptRef.current ?? "unknown"}:assistant:${messageId}`;

        setMessages((current) => {
          const index = current.findIndex((message) => message.id === id);
          if (index === -1) {
            return [...current, { id, role: "assistant", text }];
          }

          const next = [...current];
          next[index] = {
            ...next[index],
            text: next[index].text + text,
          };
          return next;
        });
        return;
      }

      if (
        update.sessionUpdate !== "tool_call" &&
        update.sessionUpdate !== "tool_call_update"
      ) {
        return;
      }

      const toolCallId = update.toolCallId;
      if (typeof toolCallId !== "string" || !toolCallId) return;

      setTools((current) => {
        const index = current.findIndex((tool) => tool.id === toolCallId);
        const previous = index === -1 ? null : current[index];
        const nextTool: ToolEntry = {
          id: toolCallId,
          title:
            typeof update.title === "string"
              ? update.title
              : previous?.title ?? toolCallId,
          status:
            typeof update.status === "string"
              ? update.status
              : previous?.status ?? "pending",
          kind:
            typeof update.kind === "string"
              ? update.kind
              : previous?.kind,
          name:
            typeof update.name === "string"
              ? update.name
              : previous?.name,
        };

        if (index === -1) return [...current, nextTool];

        const next = [...current];
        next[index] = nextTool;
        return next;
      });
    };

    const applyEvent = (event: AgentStreamEvent) => {
      if (event.attemptId) ensureAttempt(event.attemptId);

      if (event.type === "prompt") {
        setMessages((current) => [
          ...current,
          {
            id: `user:${event.attemptId}:${event.seq}`,
            role: "user",
            text: event.text,
          },
        ]);
        return;
      }

      if (event.type === "update") {
        applyUpdate(event.update);
        return;
      }

      if (event.type === "permission") {
        setPermissions((current) => ({
          ...current,
          [event.permission.id]: event.permission,
        }));
        return;
      }

      if (event.type === "permission-mode") {
        setAutoApprove(event.enabled);
        return;
      }

      setSessionStatus(event.status);

      if (event.error) {
        setError(event.error);
      }

      if (event.status === "running") {
        setConnection("open");
      }
    };

    const handleEvent = (event: Event) => {
      const messageEvent = event as MessageEvent<string>;
      let data: AgentStreamEvent;

      try {
        data = JSON.parse(messageEvent.data) as AgentStreamEvent;
      } catch {
        return;
      }

      const eventId =
        messageEvent.lastEventId || `${data.attemptId}:${data.seq}`;
      const duplicate = seenRef.current.has(eventId);

      if (!duplicate) {
        seenRef.current.add(eventId);
        applyEvent(data);
      }

      if (
        data.type === "status" &&
        (data.status === "completed" ||
          data.status === "failed" ||
          data.status === "idle")
      ) {
        terminalRef.current = true;
        setConnection(data.status === "idle" ? "idle" : "done");
        setAutoApprove(false);
        source.close();

        if (sourceRef.current === source) {
          sourceRef.current = null;
        }
      }
    };

    source.addEventListener("prompt", handleEvent);
    source.addEventListener("update", handleEvent);
    source.addEventListener("status", handleEvent);
    source.addEventListener("permission", handleEvent);
    source.addEventListener("permission-mode", handleEvent);

    source.onopen = () => {
      if (!terminalRef.current) setConnection("open");
    };

    source.onerror = () => {
      if (terminalRef.current) return;

      if (source.readyState === EventSource.CLOSED) {
        setConnection("error");
      } else {
        setConnection("reconnecting");
      }
    };

    return () => {
      terminalRef.current = true;
      source.close();
      if (sourceRef.current === source) {
        sourceRef.current = null;
      }
    };
  }, [episodeSlug, kind]);

  async function decidePermission(
    permissionId: string,
    decision: "approve" | "reject",
  ) {
    setDeciding((current) => ({
      ...current,
      [permissionId]: true,
    }));
    setError(null);

    try {
      const security = await fetch("/api/security/session", {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!security.ok) {
        throw new Error("Sesi keamanan belum siap. Muat ulang halaman.");
      }

      const response = await fetch(
        `/api/permissions/${encodeURIComponent(permissionId)}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | { permission?: PermissionRecord; error?: string }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "Gagal memproses keputusan izin.");
        return;
      }

      if (data?.permission) {
        setPermissions((current) => ({
          ...current,
          [permissionId]: data.permission as PermissionRecord,
        }));
      }
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : "Gagal memproses keputusan izin.",
      );
    } finally {
      setDeciding((current) => {
        const next = { ...current };
        delete next[permissionId];
        return next;
      });
    }
  }

  async function toggleAutoApprove() {
    if (autoPending || sessionStatus !== "running") return;

    setAutoPending(true);
    setError(null);

    try {
      const security = await fetch("/api/security/session", {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!security.ok) {
        throw new Error("Sesi keamanan belum siap. Muat ulang halaman.");
      }

      const response = await fetch(
        `/api/episodes/${encodeURIComponent(episodeSlug)}/steps/${kind}/permissions/auto`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !autoApprove }),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | { enabled?: boolean; error?: string }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "Gagal mengubah mode izin otomatis.");
        return;
      }

      setAutoApprove(Boolean(data?.enabled));
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Gagal mengubah mode izin otomatis.",
      );
    } finally {
      setAutoPending(false);
    }
  }

  const permissionList = Object.values(permissions).sort(
    (left, right) => {
      const leftPending = left.status === "pending" ? 0 : 1;
      const rightPending = right.status === "pending" ? 0 : 1;

      return (
        leftPending - rightPending ||
        left.requestedAt.localeCompare(right.requestedAt)
      );
    },
  );
  const pendingPermissionCount = permissionList.filter(
    (permission) => permission.status === "pending",
  ).length;
  const canToggleAuto =
    sessionStatus === "running" && Boolean(attemptId);

  const showEmptyState =
    messages.length === 0 && tools.length === 0;

  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            tone={connectionTone(connection)}
            pulse={connection === "open"}
          >
            {CONNECTION_LABELS[connection]}
          </StatusPill>
          <StatusPill
            tone={sessionTone(sessionStatus)}
            pulse={sessionStatus === "running"}
          >
            {SESSION_LABELS[sessionStatus]}
          </StatusPill>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Live stream / SSE
        </span>
      </div>

      <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.025] p-3.5 sm:p-4">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border",
                autoApprove
                  ? "border-primary/30 bg-primary/15 text-primary"
                  : "border-white/10 bg-white/5 text-muted-foreground",
              )}
            >
              <SparkIcon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                Mode izin otomatis
              </p>
              <p className="mt-1 max-w-[58ch] text-xs leading-relaxed text-muted-foreground">
                Berlaku hanya untuk langkah ini. Permintaan yang sudah
                menunggu tetap membutuhkan keputusan manual.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {autoApprove ? "ON" : "OFF"}
              </span>
              <Switch
                checked={autoApprove}
                onCheckedChange={() => {
                  void toggleAutoApprove();
                }}
                disabled={!canToggleAuto || autoPending}
                aria-label="Mode izin otomatis"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {autoApprove ? (
                <StatusPill tone="accent">Auto-izin aktif</StatusPill>
              ) : null}
              {pendingPermissionCount > 0 ? (
                <StatusPill tone="warning">
                  {pendingPermissionCount} izin menunggu
                </StatusPill>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {permissionList.length > 0 ? (
        <div className="grid min-w-0 gap-2.5" aria-live="polite">
          {permissionList.map((permission) => (
            <Item
              key={permission.id}
              variant="outline"
              size="sm"
              className={cn(
                "min-w-0 border-white/10 bg-white/[0.03] text-foreground",
                permission.status === "pending" &&
                  "border-primary/35 bg-primary/[0.055]",
              )}
            >
              <ItemMedia variant="icon">
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border",
                    permission.status === "pending"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-white/10 bg-white/5 text-muted-foreground",
                  )}
                >
                  <ShieldIcon className="size-4" />
                </span>
              </ItemMedia>
              <ItemContent className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ItemTitle className="max-w-full break-words [overflow-wrap:anywhere] text-foreground">
                    {permission.title}
                  </ItemTitle>
                  {permission.auto ? (
                    <Badge
                      variant="outline"
                      className="border-primary/30 font-mono text-[10px] uppercase tracking-[0.08em] text-primary"
                    >
                      Auto
                    </Badge>
                  ) : null}
                </div>
                <ItemDescription className="line-clamp-none whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-muted-foreground">
                  {permission.summary}
                </ItemDescription>
                {permission.error ? (
                  <p className="break-words [overflow-wrap:anywhere] text-xs text-destructive">
                    {permission.error}
                  </p>
                ) : null}
              </ItemContent>
              <ItemActions className="w-full justify-end sm:w-auto">
                {permission.status === "pending" &&
                sessionStatus === "running" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-white/10 bg-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      disabled={Boolean(deciding[permission.id])}
                      onClick={() => {
                        void decidePermission(
                          permission.id,
                          "reject",
                        );
                      }}
                    >
                      <XIcon className="size-3.5" />
                      Tolak
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-primary text-primary-foreground hover:brightness-105"
                      disabled={Boolean(deciding[permission.id])}
                      onClick={() => {
                        void decidePermission(
                          permission.id,
                          "approve",
                        );
                      }}
                    >
                      <CheckIcon className="size-3.5" />
                      Setujui
                    </Button>
                  </>
                ) : (
                  <StatusPill tone={permissionTone(permission)}>
                    {permission.status === "pending"
                      ? "Sesi tidak aktif"
                      : permissionStatusLabel(permission)}
                  </StatusPill>
                )}
              </ItemActions>
            </Item>
          ))}
        </div>
      ) : null}

      {error ? <InlineError message={error} /> : null}

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <div
          aria-hidden="true"
          className="bg-blueprint-dark pointer-events-none absolute inset-0 opacity-60"
        />
        <div className="relative h-[clamp(22rem,45vh,34rem)]">
          <MessageScrollerProvider autoScroll>
            <MessageScroller>
              <MessageScrollerViewport>
                <MessageScrollerContent className="gap-4 p-4 sm:p-5">
                  {showEmptyState ? (
                    <MessageScrollerItem
                      messageId="empty-state"
                      className="flex min-h-[18rem] items-center justify-center"
                    >
                      <ConsoleEmptyState connection={connection} />
                    </MessageScrollerItem>
                  ) : null}

                  {messages.map((message) => (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                      scrollAnchor={message.role === "user"}
                      className="animate-rise"
                    >
                      <Message
                        align={message.role === "user" ? "end" : "start"}
                      >
                        <MessageContent>
                          <p
                            className={cn(
                              "mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground",
                              message.role === "user" && "text-right",
                            )}
                          >
                            {message.role === "user" ? "Anda" : "Agen"}
                          </p>
                          <Bubble
                            align={
                              message.role === "user" ? "end" : "start"
                            }
                            variant="ghost"
                            className={cn(
                              "max-w-[88%] rounded-2xl border px-3.5 py-2.5 text-sm leading-relaxed",
                              message.role === "user"
                                ? "border-primary/25 bg-primary text-primary-foreground"
                                : "border-white/5 bg-white/[0.04] text-foreground",
                            )}
                          >
                            <BubbleContent className="break-words whitespace-pre-wrap">
                              {message.text}
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  ))}

                  {tools.length > 0 ? (
                    <MessageScrollerItem
                      messageId="tool-activity"
                      className="animate-rise"
                    >
                      <Message>
                        <MessageContent>
                          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                              <span>Tool activity</span>
                              <span>{String(tools.length).padStart(2, "0")}</span>
                            </div>
                            <Trace>
                              {tools.map((tool) => (
                                <TraceLine
                                  key={tool.id}
                                  status={traceStatus(tool.status)}
                                >
                                  <TraceIcon>
                                    <WrenchIcon />
                                  </TraceIcon>
                                  <TraceTitle>{tool.title}</TraceTitle>
                                  <TraceDescription>
                                    {toolStatusLabel(tool.status)}
                                  </TraceDescription>
                                </TraceLine>
                              ))}
                            </Trace>
                          </div>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  ) : null}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        <span>Langkah / {STEP_LABELS[kind]}</span>
        {attemptId ? (
          <span>Percobaan / {attemptId.slice(0, 8)}</span>
        ) : (
          <span>Menunggu sesi</span>
        )}
      </div>
    </div>
  );
}
