import { PermissionError } from "@/server/agent-streams/errors";
import { decidePermission } from "@/server/agent-streams/manager";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body harus berupa JSON yang valid." }, 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json({ error: "Body harus berupa objek JSON." }, 400);
  }

  const decision = (body as { decision?: unknown }).decision;

  if (decision !== "approve" && decision !== "reject") {
    return json(
      { error: "Keputusan harus 'approve' atau 'reject'." },
      400,
    );
  }

  try {
    const permission = await decidePermission(id, decision);
    return json({ permission });
  } catch (error) {
    if (error instanceof PermissionError) {
      const status =
        error.code === "invalid-decision"
          ? 400
          : error.code === "not-found"
            ? 404
            : error.code === "log-failed"
              ? 500
              : 409;

      return json({ error: error.message }, status);
    }

    console.error("Gagal memproses keputusan izin:", error);
    return json({ error: "Gagal memproses keputusan izin." }, 500);
  }
}
