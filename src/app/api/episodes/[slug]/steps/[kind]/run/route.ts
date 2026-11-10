import {
  AgentConfigError,
  loadAgentsConfig,
} from "@/server/agents/config";
import { STEP_KINDS, type StepKind } from "@/server/db";
import { AgentStreamError } from "@/server/agent-streams/errors";
import { startStepStream } from "@/server/agent-streams/manager";
import { getEpisodeBySlug } from "@/server/episodes/repository";
import {
  WorkspaceInitializationError,
} from "@/server/workspace/init";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body harus berupa JSON yang valid." }, 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json({ error: "Body harus berupa objek JSON." }, 400);
  }

  const { agentId, prompt } = body as {
    agentId?: unknown;
    prompt?: unknown;
  };

  if (typeof prompt !== "string" || !prompt.trim()) {
    return json({ error: "Prompt wajib diisi." }, 400);
  }

  try {
    const config = loadAgentsConfig();
    const requestedAgentId =
      typeof agentId === "string" && agentId.trim()
        ? agentId.trim()
        : config.agents[0]?.id;

    if (!requestedAgentId) {
      return json(
        { error: "Belum ada agen yang dikonfigurasi di agents.json." },
        400,
      );
    }

    if (!config.byId.has(requestedAgentId)) {
      return json(
        { error: `Agen "${requestedAgentId}" tidak terdaftar.` },
        400,
      );
    }

    const attempt = await startStepStream({
      episodeSlug: slug,
      kind: kind as StepKind,
      agentId: requestedAgentId,
      prompt,
    });

    return json({ attempt }, 201);
  } catch (error) {
    if (error instanceof AgentStreamError) {
      const status =
        error.code === "already-running"
          ? 409
          : error.code === "start-failed"
            ? 500
            : 400;

      return json({ error: error.message }, status);
    }

    if (error instanceof AgentConfigError) {
      return json(
        { error: error.message, fix: error.fix },
        error.code === "workspace" ? 503 : 400,
      );
    }

    if (error instanceof WorkspaceInitializationError) {
      return json({ error: error.message, fix: error.fix }, 503);
    }

    console.error("Gagal memulai sesi agen:", error);
    return json({ error: "Gagal memulai sesi agen." }, 500);
  }
}
