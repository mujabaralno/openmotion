import { subscribeStepStream } from "@/server/agent-streams/manager";
import type { AgentStreamEvent } from "@/server/agent-streams/types";
import { STEP_KINDS } from "@/server/db";
import { getEpisodeBySlug } from "@/server/episodes/repository";
import {
  WorkspaceInitializationError,
  resolveWorkspaceDir,
} from "@/server/workspace/init";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isTerminal(event: AgentStreamEvent): boolean {
  return event.type === "status" && event.status !== "running";
}

function parseLastEventId(value: string | null): {
  attemptId: string | null;
  seq: number;
} {
  if (!value) return { attemptId: null, seq: 0 };

  const separator = value.lastIndexOf(":");
  if (separator <= 0) return { attemptId: null, seq: 0 };

  const seq = Number(value.slice(separator + 1));

  if (!Number.isInteger(seq) || seq < 0) {
    return { attemptId: null, seq: 0 };
  }

  return {
    attemptId: value.slice(0, separator),
    seq,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; kind: string }> },
) {
  const { slug, kind } = await context.params;

  if (!(STEP_KINDS as readonly string[]).includes(kind)) {
    return json({ error: `Jenis langkah tidak dikenal: ${kind}.` }, 400);
  }

  const episode = getEpisodeBySlug(slug);
  if (!episode) {
    return json({ error: "Episode tidak ditemukan." }, 404);
  }

  let workspaceRoot: string;
  try {
    workspaceRoot = resolveWorkspaceDir();
  } catch (error) {
    if (error instanceof WorkspaceInitializationError) {
      return json({ error: error.message, fix: error.fix }, 503);
    }

    return json({ error: "Workspace belum siap." }, 503);
  }

  const lastEvent = parseLastEventId(
    request.headers.get("last-event-id"),
  );

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: NodeJS.Timeout | undefined;
  let abortListener: (() => void) | undefined;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null =
    null;
  let closed = false;

  const cleanup = () => {
    if (closed) {
      if (heartbeat) clearInterval(heartbeat);
      return;
    }

    closed = true;
    unsubscribe();

    if (heartbeat) clearInterval(heartbeat);
    if (abortListener) {
      request.signal.removeEventListener("abort", abortListener);
    }
  };

  const close = () => {
    if (closed) return;

    try {
      controllerRef?.close();
    } catch {
      // Stream sudah ditutup.
    }

    cleanup();
  };

  const send = (event: AgentStreamEvent) => {
    if (closed || !controllerRef) return;

    const id = event.attemptId
      ? `${event.attemptId}:${event.seq}`
      : `idle:${event.seq}`;
    const frame = `id: ${id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

    try {
      controllerRef.enqueue(encoder.encode(frame));
    } catch {
      close();
      return;
    }

    if (isTerminal(event)) {
      close();
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;

      try {
        controller.enqueue(encoder.encode("retry: 1500\n\n"));
      } catch {
        close();
        return;
      }

      let subscription: ReturnType<typeof subscribeStepStream>;

      try {
        subscription = subscribeStepStream({
          episodeSlug: slug,
          kind: kind as (typeof STEP_KINDS)[number],
          workspaceRoot,
          afterAttemptId: lastEvent.attemptId,
          afterSeq: lastEvent.seq,
          onEvent: (event) => send(event),
        });
      } catch (error) {
        send({
          seq: 0,
          attemptId: "",
          type: "status",
          status: "failed",
          at: new Date().toISOString(),
          error:
            error instanceof Error
              ? error.message
              : "Gagal membuka riwayat langkah.",
        });
        close();
        return;
      }

      unsubscribe = subscription.unsubscribe;

      for (const event of subscription.replay) {
        send(event);
        if (closed) return;
      }

      if (subscription.terminal) {
        close();
        return;
      }

      heartbeat = setInterval(() => {
        if (closed || !controllerRef) return;

        try {
          controllerRef.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          close();
        }
      }, 15000);

      abortListener = () => {
        cleanup();
      };

      if (request.signal.aborted) {
        cleanup();
        return;
      }

      request.signal.addEventListener("abort", abortListener);
    },

    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
