"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { WrenchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/server/agent-streams/types";
import type { StepKind } from "@/server/db";

const STEP_OPTIONS = Object.keys(STEP_LABELS) as StepKind[];

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

type AgentSummary = {
  id: string;
  name: string;
};

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

function connectionVariant(
  state: ConnectionState,
): "default" | "secondary" | "destructive" | "outline" {
  if (state === "error") return "destructive";
  if (state === "open") return "default";
  if (state === "reconnecting" || state === "connecting") return "outline";
  return "secondary";
}

function sessionVariant(
  status: AgentStreamStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed") return "destructive";
  if (status === "completed") return "default";
  if (status === "running") return "secondary";
  return "outline";
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

function AgentStreamView({
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
        source.close();

        if (sourceRef.current === source) {
          sourceRef.current = null;
        }
      }
    };

    source.addEventListener("prompt", handleEvent);
    source.addEventListener("update", handleEvent);
    source.addEventListener("status", handleEvent);

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

  const showEmptyState =
    messages.length === 0 && tools.length === 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge variant={connectionVariant(connection)}>
          {CONNECTION_LABELS[connection]}
        </Badge>
        <Badge variant={sessionVariant(sessionStatus)}>
          {SESSION_LABELS[sessionStatus]}
        </Badge>
      </div>

      {error ? (
        <p
          className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="h-[30rem] overflow-hidden rounded-xl border bg-background">
        <MessageScrollerProvider autoScroll>
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent className="p-4">
                {showEmptyState ? (
                  <MessageScrollerItem messageId="empty-state">
                    <Marker>
                      <MarkerIcon>
                        <WrenchIcon />
                      </MarkerIcon>
                      <MarkerContent>
                        {connection === "connecting"
                          ? "Memuat riwayat..."
                          : connection === "reconnecting"
                            ? "Menyambung ulang..."
                            : "Belum ada percakapan untuk langkah ini."}
                      </MarkerContent>
                    </Marker>
                  </MessageScrollerItem>
                ) : null}

                {messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={message.role === "user"}
                  >
                    <Message
                      align={message.role === "user" ? "end" : "start"}
                    >
                      <MessageContent>
                        <Bubble
                          align={message.role === "user" ? "end" : "start"}
                          variant={
                            message.role === "user" ? "muted" : "ghost"
                          }
                        >
                          <BubbleContent className="whitespace-pre-wrap">
                            {message.text}
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))}

                {tools.length > 0 ? (
                  <MessageScrollerItem messageId="tool-activity">
                    <Message>
                      <MessageContent>
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

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Langkah: {STEP_LABELS[kind]}</span>
        {attemptId ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              Percobaan {attemptId.slice(0, 8)}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function AgentChatPanel({ episodeSlug }: { episodeSlug: string }) {
  const [kind, setKind] = useState<StepKind>("script");
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentId, setAgentId] = useState("");
  const [prompt, setPrompt] = useState(
    "Halo, ini uji streaming dari Workflow Studio.",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    fetch("/api/agents", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | { agents?: AgentSummary[]; error?: string; fix?: string }
          | null;

        if (!active) return;

        if (!response.ok) {
          setConfigError(
            [data?.error, data?.fix].filter(Boolean).join(" ") ||
              "Gagal membaca daftar agen.",
          );
          return;
        }

        const nextAgents = data?.agents ?? [];
        setAgents(nextAgents);
        setAgentId((current) => current || nextAgents[0]?.id || "");
      })
      .catch((fetchError: unknown) => {
        if (!active) return;
        setConfigError(
          fetchError instanceof Error
            ? fetchError.message
            : "Gagal membaca daftar agen.",
        );
      });

    return () => {
      active = false;
    };
  }, []);

  async function startSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) return;

    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setError("Prompt wajib diisi.");
      return;
    }

    if (!agentId) {
      setError("Pilih agen terlebih dahulu.");
      return;
    }

    setPending(true);
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
        `/api/episodes/${encodeURIComponent(episodeSlug)}/steps/${kind}/run`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, prompt: cleanPrompt }),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | { error?: string; fix?: string }
        | null;

      if (!response.ok) {
        setError(
          [data?.error, data?.fix].filter(Boolean).join(" ") ||
            "Gagal memulai sesi agen.",
        );

        if (response.status === 409) {
          setReloadToken((value) => value + 1);
        }

        return;
      }

      setReloadToken((value) => value + 1);
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Gagal memulai sesi agen.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-5 rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Chat agen</h2>
        <p className="text-sm text-muted-foreground">
          Ikuti keluaran agen untuk langkah yang dipilih. Membuka atau
          menyegarkan halaman tidak menjalankan agen.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {STEP_OPTIONS.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={option === kind ? "default" : "outline"}
            onClick={() => setKind(option)}
          >
            {STEP_LABELS[option]}
          </Button>
        ))}
      </div>

      {configError ? (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {configError}
        </p>
      ) : null}

      <form
        className="mt-4 grid gap-3 rounded-lg border bg-muted/30 p-3"
        onSubmit={startSession}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Sesi uji</span>
          <Select
            value={agentId}
            onValueChange={(value) => setAgentId(value ?? "")}
          >
            <SelectTrigger className="w-full sm:w-56" aria-label="Agen">
              <SelectValue placeholder="Pilih agen" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={pending || !agentId}>
            {pending ? "Memulai..." : "Mulai sesi"}
          </Button>
        </div>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={2}
          maxLength={20000}
          placeholder="Prompt untuk agen..."
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Memakai agen dari <code>agents.json</code>. Ini kontrol uji
          sementara, bukan aturan pipeline.
        </p>
      </form>

      {error ? (
        <p
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <AgentStreamView
          key={`${episodeSlug}:${kind}:${reloadToken}`}
          episodeSlug={episodeSlug}
          kind={kind}
        />
      </div>
    </section>
  );
}
