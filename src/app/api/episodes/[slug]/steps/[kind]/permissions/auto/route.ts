import { PermissionError } from "@/server/agent-streams/errors";
import { setAutoApprovePermissions } from "@/server/agent-streams/manager";
import { STEP_KINDS, type StepKind } from "@/server/db";
import { getEpisodeBySlug } from "@/server/episodes/repository";

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

  if (!getEpisodeBySlug(slug)) {
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

  const enabled = (body as { enabled?: unknown }).enabled;

  if (typeof enabled !== "boolean") {
    return json({ error: "enabled harus berupa boolean." }, 400);
  }

  try {
    const result = setAutoApprovePermissions(
      slug,
      kind as StepKind,
      enabled,
    );
    return json(result);
  } catch (error) {
    if (error instanceof PermissionError) {
      return json(
        { error: error.message },
        error.code === "no-active-session" ? 409 : 400,
      );
    }

    console.error("Gagal mengubah mode izin otomatis:", error);
    return json({ error: "Gagal mengubah mode izin otomatis." }, 500);
  }
}
