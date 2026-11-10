import { approveStep } from '@/server/pipeline/service';
import { apiError, json, stepParams } from '@/server/pipeline/http';
export const dynamic = 'force-dynamic';
export async function POST(_request: Request, context: { params: Promise<{slug: string; kind: string}> }) {
  try { const {slug, kind} = await context.params; return json(approveStep(slug, stepParams(slug, kind))); } catch (error) { return apiError(error); }
}
