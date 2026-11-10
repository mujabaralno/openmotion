import { getDb, STEP_KINDS, type StepKind, type StepStatus } from '../db/index.ts';
import { getEpisodeBySlug } from '../episodes/repository.ts';
import { getStepStreamInfo } from '../agent-streams/manager.ts';

export type PipelineStep = { id: number; kind: StepKind; status: StepStatus; agentId: string | null; modelId: string | null; effort: string | null; notes: string; error: string | null; startedAt: string | null; finishedAt: string | null; sessionRef: string | null };
export function getSteps(slug: string): PipelineStep[] {
  const episode = getEpisodeBySlug(slug);
  if (!episode) throw new Error('Episode tidak ditemukan.');
  const rows = getDb().prepare(`SELECT id, kind, status, agent_id AS agentId, model_id AS modelId, effort, notes, error, started_at AS startedAt, finished_at AS finishedAt, session_ref AS sessionRef FROM steps WHERE episode_id = ?`).all(episode.id) as PipelineStep[];
  return STEP_KINDS.map(kind => rows.find(row => row.kind === kind)!);
}
export function setStep(slug: string, kind: StepKind, status: StepStatus, error: string | null = null): void {
  getDb().prepare(`UPDATE steps SET status = ?, error = ?, finished_at = CASE WHEN ? IN ('review','approved','failed') THEN ? ELSE NULL END WHERE episode_id = (SELECT id FROM episodes WHERE slug = ?) AND kind = ?`).run(status, error, status, new Date().toISOString(), slug, kind);
  getDb().prepare('UPDATE episodes SET updated_at = ? WHERE slug = ?').run(new Date().toISOString(), slug);
}
export function assertCanRun(slug: string, kind: StepKind): PipelineStep {
  const steps = getSteps(slug);
  const index = STEP_KINDS.indexOf(kind);
  if (index < 0) throw new Error('Langkah tidak dikenal.');
  if (steps.some(step => step.status === 'running')) throw new Error('Masih ada langkah berjalan pada episode ini.');
  if (steps.some(step => getStepStreamInfo(slug, step.kind)?.status === 'running')) throw new Error('Tunggu sesi agen sebelumnya selesai.');
  if (steps.slice(0, index).some(step => step.status !== 'approved')) throw new Error('Setujui semua langkah sebelumnya terlebih dahulu.');
  if (steps[index].status === 'approved' || steps[index].status === 'review') throw new Error('Gunakan Minta revisi untuk mengulang hasil yang sudah tersedia.');
  return steps[index];
}
export function beginStep(slug: string, kind: StepKind, agentId: string | null, modelId: string | null = null, effort: string | null = null): void {
  getDb().prepare(`UPDATE steps SET status = 'running', agent_id = ?, model_id = ?, effort = ?, session_ref = NULL, started_at = ?, finished_at = NULL, error = NULL WHERE episode_id = (SELECT id FROM episodes WHERE slug = ?) AND kind = ?`).run(agentId, modelId, effort, new Date().toISOString(), slug, kind);
}
export function requestRevision(slug: string, kind: StepKind, notes: string): void {
  const steps = getSteps(slug);
  if (steps.some(step => step.status === 'running')) throw new Error('Batalkan langkah yang berjalan sebelum meminta revisi.');
  const target = kind === 'render' ? 'scenes' : kind;
  const index = STEP_KINDS.indexOf(target);
  const update = getDb().transaction(() => {
    for (const later of STEP_KINDS.slice(index)) {
      getDb().prepare(`UPDATE steps SET status = 'idle', notes = ?, error = NULL, finished_at = NULL, session_ref = NULL WHERE id = ?`).run(later === target ? notes : '', steps.find(step => step.kind === later)!.id);
    }
    getDb().prepare('UPDATE episodes SET updated_at = ? WHERE slug = ?').run(new Date().toISOString(), slug);
  }); update();
}
export function recoverInterruptedSteps(): void {
  const state = globalThis as typeof globalThis & { __openMotionRecovered?: boolean };
  if (state.__openMotionRecovered) return;
  state.__openMotionRecovered = true;
  getDb().prepare(`UPDATE steps SET status = 'failed', error = 'Server berhenti saat pekerjaan berjalan. Jalankan ulang langkah ini.', finished_at = ? WHERE status = 'running'`).run(new Date().toISOString());
  getDb().prepare(`UPDATE render_jobs SET status = 'failed', error = 'Render terputus karena server restart.', finished_at = ? WHERE status IN ('running','queued')`).run(new Date().toISOString());
}
