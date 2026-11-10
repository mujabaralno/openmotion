import {
  AgentConfigError,
  loadAgentsConfig,
} from "@/server/agents/config";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    const config = loadAgentsConfig();
    return json({
      agents: config.agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
      })),
    });
  } catch (error) {
    if (error instanceof AgentConfigError) {
      return json(
        { error: error.message, fix: error.fix },
        error.code === "workspace" ? 503 : 400,
      );
    }

    console.error("Gagal membaca daftar agen:", error);
    return json({ error: "Gagal membaca daftar agen." }, 500);
  }
}
