import { getEpisodeBySlug } from "../../../../server/episodes/repository.ts";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const episode = getEpisodeBySlug(slug);

    if (!episode) {
      return json({ error: "Episode tidak ditemukan." }, 404);
    }

    return json({ episode });
  } catch (error) {
    console.error("Gagal membaca detail episode:", error);
    return json({ error: "Gagal membaca detail episode." }, 500);
  }
}
