import { runPipelineStep } from '@/server/pipeline/service';
import { apiError, bodyObject, json, stepParams } from '@/server/pipeline/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{slug: string; kind: string}> }) {
  try { const {slug, kind} = await context.params; const step = stepParams(slug, kind); const body = await bodyObject(request); return json(await runPipelineStep(slug, step, body), 202); }
  catch (error) { return apiError(error); }
}
