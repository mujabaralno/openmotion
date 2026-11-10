export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { ok: true, method: "GET" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST() {
  return Response.json(
    { ok: true, method: "POST" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
