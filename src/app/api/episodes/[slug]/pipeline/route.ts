import { pipelineView } from '@/server/pipeline/service';
import { apiError, json } from '@/server/pipeline/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{slug: string}> }) {
  try { return json(pipelineView((await context.params).slug)); } catch (error) { return apiError(error); }
}
