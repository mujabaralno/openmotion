import { STEP_KINDS, type StepKind } from '../db/index.ts';
import { getEpisodeBySlug } from '../episodes/repository.ts';
import { redactText } from '../security/redact.ts';
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export function stepParams(slug: string, kind: string): StepKind {
  if (!(STEP_KINDS as readonly string[]).includes(kind)) throw new Error('Langkah tidak dikenal.');
  if (!getEpisodeBySlug(slug)) throw new Error('Episode tidak ditemukan.');
  return kind as StepKind;
}
export async function bodyObject(request: Request): Promise<Record<string, unknown>> {
  const content = await request.text();
  if (content.length > 250000) throw new Error('Permintaan terlalu besar.');
  const body: unknown = JSON.parse(content || '{}');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Body harus berupa objek JSON.');
  return body as Record<string, unknown>;
}
export function apiError(error: unknown) {
  const message = redactText(error instanceof Error ? error.message : String(error));
  return json({ error: message }, message === 'Episode tidak ditemukan.' ? 404 : 400);
}
