import { listEpisodes } from "../../../server/episodes/repository.ts";
import {
  createEpisode,
  EpisodeCreationError,
  EpisodeValidationError,
} from "../../../server/episodes/service.ts";
import { WorkspaceInitializationError } from "../../../server/workspace/init.ts";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    return json({ episodes: listEpisodes() });
  } catch (error) {
    console.error("Gagal membaca daftar episode:", error);
    return json({ error: "Gagal membaca daftar episode." }, 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Body harus berupa JSON yang valid." }, 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json({ error: "Body harus berupa objek JSON." }, 400);
  }

  const { title, topic } = body as {
    title?: unknown;
    topic?: unknown;
  };

  try {
    const episode = createEpisode({ title, topic });
    return json({ episode }, 201);
  } catch (error) {
    if (error instanceof EpisodeValidationError) {
      return json({ error: error.message }, 400);
    }

    if (error instanceof WorkspaceInitializationError) {
      return json({ error: error.message, fix: error.fix }, 503);
    }

    if (error instanceof EpisodeCreationError) {
      console.error("Gagal membuat episode:", error.message);
      return json({ error: error.message }, 500);
    }

    console.error("Gagal membuat episode:", error);
    return json({ error: "Gagal membuat episode. Coba lagi." }, 500);
  }
}
