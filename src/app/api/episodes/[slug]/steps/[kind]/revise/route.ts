import { reviseStep } from '@/server/pipeline/service';
import { apiError, bodyObject, json, stepParams } from '@/server/pipeline/http';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{slug: string; kind: string}> }) {
  try { const {slug, kind} = await context.params; const body = await bodyObject(request); return json(reviseStep(slug, stepParams(slug, kind), body.notes)); } catch (error) { return apiError(error); }
}
