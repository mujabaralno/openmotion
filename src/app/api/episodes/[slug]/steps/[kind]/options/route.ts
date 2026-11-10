import { discoverAgentOptions } from '@/server/agents/options';
import { apiError, bodyObject, json, stepParams } from '@/server/pipeline/http';
import { pipelineView } from '@/server/pipeline/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ slug: string; kind: string }> }) {
  try {
    const { slug, kind } = await context.params;
    stepParams(slug, kind);
    if (!['script', 'tags', 'scenes'].includes(kind)) throw new Error('Langkah ini tidak memakai model agen.');
    const view = pipelineView(slug);
    if (view.task || view.steps.some(step => step.status === 'running')) throw new Error('Tunggu atau batalkan pekerjaan aktif sebelum memuat pilihan model.');
    const body = await bodyObject(request);
    if (typeof body.agentId !== 'string' || !body.agentId || body.agentId.length > 64) throw new Error('Pilih agen terlebih dahulu.');
    if (body.modelId !== undefined && (typeof body.modelId !== 'string' || body.modelId.length > 500)) throw new Error('Model tidak valid.');
    return json(await discoverAgentOptions({ agentId: body.agentId, episodeSlug: slug, modelId: body.modelId as string | undefined, signal: request.signal }));
  } catch (error) { return apiError(error); }
}
