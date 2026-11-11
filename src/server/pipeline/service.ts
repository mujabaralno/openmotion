import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { getDb, STEP_KINDS, type StepKind } from '../db/index.ts';
import { getEpisodeBySlug } from '../episodes/repository.ts';
import { loadAgentsConfig } from '../agents/config.ts';
import { startStepStream, cancelStepStream } from '../agent-streams/manager.ts';
import { redactText } from '../security/redact.ts';
import { artifactPath, readArtifact, writeArtifact, hasArtifact } from './files.ts';
import { getSettings } from './settings.ts';
import { assertCanRun, beginStep, getSteps, requestRevision, setStep } from './state.ts';
import { buildStepPrompt } from './prompts.ts';
import { SFX_FILES } from './sfx.ts';
import { prepareComposition } from './composition.ts';
import { generateVoiceover } from '../elevenlabs/client.ts';
import { AGENT_STEP_KINDS } from '../../lib/pipeline-steps.ts';
import { parsePublishPack } from '../../lib/publish-pack.ts';
import { validateThumbnail } from './thumbnail.ts';
import { runRenderWorker } from '../render/runner.ts';

type Task = { id: string; kind: StepKind; controller: AbortController; phase: string; progress: number };
type Runtime = { tasks: Map<string, Task>; renderOwner: string | null };
const runtimeGlobal = globalThis as typeof globalThis & { __openMotionPipeline?: Runtime };
const runtime = () => runtimeGlobal.__openMotionPipeline ??= { tasks: new Map(), renderOwner: null };
const taskActive = (slug: string, task: Task) => runtime().tasks.get(slug)?.id === task.id && !task.controller.signal.aborted;
function checkActive(slug: string, task: Task) { if (!taskActive(slug, task)) throw new Error('Pekerjaan dibatalkan.'); }
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const sfxHash = (slug: string) => hash(Buffer.concat(Object.values(SFX_FILES).map(name => fs.readFileSync(artifactPath(slug, name, 'composition-public')))));

export function pipelineView(slug: string) {
  const episode = getEpisodeBySlug(slug);
  if (!episode) throw new Error('Episode tidak ditemukan.');
  const task = runtime().tasks.get(slug);
  const files = ['01-episode.md', '01-naskah.md', '02-naskah-tagged.md', '03-voiceover.mp3', '03-audio.json', '04-scenes.json', '05-thumbnail.svg', '06-publish.md'].filter(name => hasArtifact(slug, name));
  let audio: { duration?: number; modelId?: string; voiceId?: string } | null = null;
  if (hasArtifact(slug, '03-audio.json')) { try { audio = JSON.parse(readArtifact(slug, '03-audio.json')); } catch { /* invalid artifact surfaced when running */ } }
  let scenes: { captionsEstimated?: boolean } | null = null;
  if (hasArtifact(slug, '04-scenes.json')) { try { scenes = JSON.parse(readArtifact(slug, '04-scenes.json')); } catch { /* surface invalid manifest on render */ } }
  const renderJob = getDb().prepare('SELECT id, status, progress, error, output_path AS outputPath FROM render_jobs WHERE episode_id = ? ORDER BY id DESC LIMIT 1').get(episode.id) as {id:number; status:string; progress:number; error:string|null; outputPath:string|null} | undefined;
  return { episode, steps: getSteps(slug), files, audio, scenes, task: task ? { kind: task.kind, phase: task.phase, progress: task.progress } : null, renderJob: renderJob ?? null, previewAvailable: hasArtifact(slug, 'preview.mp4', 'out'), videoAvailable: hasArtifact(slug, `${slug}.mp4`, 'out') };
}

function validateScript(slug: string): void {
  const document = readArtifact(slug, '01-episode.md');
  if (!/layer map/i.test(document) || !/camera plan/i.test(document) || (document.match(/SCENE\s*\d+/gi)?.length ?? 0) < 2) throw new Error('Paket episode belum lengkap: scene, Layer Map, dan Camera Plan wajib tersedia.');
  const section = document.match(/^## Master Voice-over\s*\r?\n+```(?:text)?\s*\r?\n([\s\S]*?)\r?\n```/m);
  if (!section?.[1]?.trim()) throw new Error('Paket episode harus memiliki bagian ## Master Voice-over dengan blok text berisi narasi utuh.');
  const narration = section[1].trim();
  if (/^#{1,6}\s|```|\[(?:scene|stage)\b/im.test(narration)) throw new Error('Master narasi masih berisi instruksi scene atau Markdown.');
  writeArtifact(slug, '01-naskah.md', `${narration}\n`);
}
function validateTags(slug: string): void {
  const original = readArtifact(slug, '01-naskah.md');
  const tagged = readArtifact(slug, '02-naskah-tagged.md');
  if (!tagged.trim() || /^#{1,6}\s|```/m.test(tagged)) throw new Error('Narasi bertag harus berupa teks siap dibaca, tanpa heading atau pagar Markdown.');
  const spoken = (text: string) => text.replace(/\[[^\]]*\]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (spoken(original) !== spoken(tagged)) throw new Error('Tag emosi mengubah kata narasi. Minta revisi agar seluruh kata dan urutannya tetap sama.');
}

async function renderEpisode(slug: string, task: Task, preview: boolean): Promise<void> {
  checkActive(slug, task);
  const state = runtime();
  if (state.renderOwner) throw new Error('Renderer sedang dipakai episode lain. Coba lagi setelah selesai.');
  state.renderOwner = task.id;
  let jobId: number | null = null;
  const filename = preview ? 'preview.mp4' : `${slug}.mp4`;
  const target = artifactPath(slug, filename, 'out');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const candidate = path.join(path.dirname(target), `.render-${task.id}.mp4`);
  try {
    task.phase = preview ? 'Membuat preview' : 'Merender video'; task.progress = 0;
    if (!preview) {
      const episode = getEpisodeBySlug(slug)!;
      const result = getDb().prepare("INSERT INTO render_jobs (episode_id,status,progress,started_at) VALUES (?,'running',0,?)").run(episode.id, new Date().toISOString());
      jobId = Number(result.lastInsertRowid);
    }
    let lastSaved = 0;
    await runRenderWorker(preview ? 'preview' : 'render', path.dirname(artifactPath(slug, 'index.tsx', 'composition')), candidate, task.controller.signal, (progress, phase) => {
      task.progress = progress; task.phase = preview ? `Preview: ${phase.toLowerCase()}` : phase;
      if (jobId && Date.now() - lastSaved > 500) { lastSaved = Date.now(); getDb().prepare('UPDATE render_jobs SET progress = ? WHERE id = ?').run(progress, jobId); }
    });
    checkActive(slug, task);
    artifactPath(slug, filename, 'out');
    fs.renameSync(candidate, target);
    if (jobId) getDb().prepare("UPDATE render_jobs SET status = 'completed', progress = 1, output_path = ?, finished_at = ? WHERE id = ?").run(target, new Date().toISOString(), jobId);
  } catch (error) {
    if (jobId) getDb().prepare("UPDATE render_jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(redactText(error instanceof Error ? error.message : String(error)), new Date().toISOString(), jobId);
    throw error;
  } finally {
    if (state.renderOwner === task.id) state.renderOwner = null;
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  }
}

export async function runPipelineStep(slug: string, kind: StepKind, input: { agentId?: unknown; modelId?: unknown; effort?: unknown; overwrite?: unknown } = {}) {
  if (runtime().tasks.has(slug)) throw new Error('Tunggu pekerjaan sebelumnya benar-benar berhenti.');
  const step = assertCanRun(slug, kind);
  if (kind === 'voiceover' && hasArtifact(slug, '03-voiceover.mp3') && input.overwrite !== true) throw new Error('Audio sudah ada. Konfirmasi penimpaan sebelum generate ulang.');
  let agentId: string | null = null; let prompt = '';
  const choice = (value: unknown, label: string) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.length > 500 || /[\x00-\x1f]/.test(value)) throw new Error(`${label} tidak valid.`);
    return value.trim() || null;
  };
  const modelId = choice(input.modelId, 'Model');
  const effort = choice(input.effort, 'Effort');
  if (AGENT_STEP_KINDS.includes(kind)) {
    const agents = loadAgentsConfig();
    const settings = getSettings();
    agentId = (typeof input.agentId === 'string' && input.agentId ? input.agentId : settings.agentId || agents.agents[0]?.id) ?? null;
    if (!agentId || !agents.byId.has(agentId)) throw new Error('Pilih agen yang terdaftar pada Pengaturan.');
    prompt = buildStepPrompt(slug, kind, step.notes);
    if (kind === 'scenes') prepareComposition(slug);
  }
  const output = agentId ? (kind === 'script' ? artifactPath(slug, '01-episode.md') : kind === 'tags' ? artifactPath(slug, '02-naskah-tagged.md') : kind === 'thumbnail' ? artifactPath(slug, '05-thumbnail.svg') : kind === 'publish' ? artifactPath(slug, '06-publish.md') : artifactPath(slug, 'Episode.tsx', 'composition')) : '';
  const oldModified = output && fs.existsSync(output) ? fs.statSync(output).mtimeMs : null;
  const task: Task = { id: randomUUID(), kind, controller: new AbortController(), phase: 'Memulai', progress: 0 };
  beginStep(slug, kind, agentId, agentId ? modelId : null, agentId ? effort : null);
  runtime().tasks.set(slug, task);
  const settle = () => { if (runtime().tasks.get(slug)?.id === task.id) runtime().tasks.delete(slug); };
  const fail = (message: string) => { if (taskActive(slug, task)) setStep(slug, kind, 'failed', redactText(message)); };
  if (agentId) {
    task.phase = kind === 'script' ? 'Menyusun paket episode' : kind === 'tags' ? 'Menyiapkan tag emosi' : kind === 'thumbnail' ? 'Membuat thumbnail' : kind === 'publish' ? 'Menyiapkan paket publikasi' : 'Merakit scene';
    try {
      const attempt = await startStepStream({ episodeSlug: slug, kind, agentId, modelId, effort, workingDirectory: kind === 'scenes' ? 'remotion' : 'episode', prompt, stepId: step.id,
        onComplete: async () => {
          checkActive(slug, task);
          if (!fs.existsSync(output) || fs.statSync(output).mtimeMs === oldModified) throw new Error('Agen belum menulis atau memperbarui file keluaran yang diminta.');
          if (kind === 'script') validateScript(slug);
          if (kind === 'tags') validateTags(slug);
          if (kind === 'thumbnail') validateThumbnail(readArtifact(slug, '05-thumbnail.svg'));
          if (kind === 'publish') parsePublishPack(readArtifact(slug, '06-publish.md'));
          if (kind === 'scenes') {
            const code = fs.readFileSync(output, 'utf8');
            if (!/export\s+default\b|export\s*\{[^}]*\bas\s+default\b/.test(code)) throw new Error('Episode.tsx harus memiliki default export.');
            const imports = Array.from(code.matchAll(/\b(?:from\s*|import\s*)['"]([^'"]+)['"]/g), match => match[1]);
            if (imports.some(name => !['react', 'react/jsx-runtime', 'remotion'].includes(name)) || /\b(?:import|require)\s*\(/.test(code)) throw new Error('Komposisi hanya boleh mengimpor React dan Remotion. Simpan seluruh visual episode di Episode.tsx.');
            const metadata = prepareComposition(slug);
            await renderEpisode(slug, task, true);
            checkActive(slug, task);
            writeArtifact(slug, '04-scenes.json', JSON.stringify({ ...metadata, composition: 'Episode', sfxHash: sfxHash(slug), sourceHash: hash(code), audioHash: hash(fs.readFileSync(artifactPath(slug, '03-voiceover.mp3'))), propsHash: hash(fs.readFileSync(artifactPath(slug, 'props.json', 'composition'))), entryHash: hash(fs.readFileSync(artifactPath(slug, 'index.tsx', 'composition'))), publicAudioHash: hash(fs.readFileSync(artifactPath(slug, 'audio.mp3', 'composition-public'))), createdAt: new Date().toISOString() }, null, 2));
          }
          checkActive(slug, task); setStep(slug, kind, 'review');
        }, onFailure: fail, onSettled: settle });
      getDb().prepare('UPDATE steps SET session_ref = ? WHERE id = ?').run(attempt.attemptId, step.id);
    } catch (error) { fail(error instanceof Error ? error.message : String(error)); settle(); throw error; }
  } else {
    void (async () => {
      try {
        if (kind === 'voiceover') { task.phase = 'Menghasilkan audio ElevenLabs'; await generateVoiceover(slug, task.controller.signal); }
        else {
          const manifest = JSON.parse(readArtifact(slug, '04-scenes.json'));
          if (manifest.sfxHash !== sfxHash(slug) || manifest.sourceHash !== hash(fs.readFileSync(artifactPath(slug, 'Episode.tsx', 'composition'))) || manifest.audioHash !== hash(fs.readFileSync(artifactPath(slug, '03-voiceover.mp3'))) || manifest.propsHash !== hash(fs.readFileSync(artifactPath(slug, 'props.json', 'composition'))) || manifest.entryHash !== hash(fs.readFileSync(artifactPath(slug, 'index.tsx', 'composition'))) || manifest.publicAudioHash !== hash(fs.readFileSync(artifactPath(slug, 'audio.mp3', 'composition-public')))) throw new Error('Komposisi atau audio berubah setelah preview. Minta revisi scene dan tinjau preview kembali.');
          await renderEpisode(slug, task, false);
        }
        checkActive(slug, task); setStep(slug, kind, 'review');
      } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
      finally { settle(); }
    })();
  }
  return pipelineView(slug);
}

export function approveStep(slug: string, kind: StepKind) {
  const steps = getSteps(slug); const index = STEP_KINDS.indexOf(kind);
  if (steps[index]?.status !== 'review') throw new Error('Hanya hasil yang menunggu review dapat disetujui.');
  if (steps.slice(0,index).some(step => step.status !== 'approved')) throw new Error('Langkah sebelumnya belum disetujui.');
  if (kind === 'script') validateScript(slug);
  if (kind === 'tags') validateTags(slug);
  if (kind === 'voiceover' && !hasArtifact(slug, '03-voiceover.mp3')) throw new Error('Audio belum tersedia.');
  if (kind === 'scenes' && !hasArtifact(slug, 'preview.mp4', 'out')) throw new Error('Preview belum tersedia.');
  if (kind === 'thumbnail') validateThumbnail(readArtifact(slug, '05-thumbnail.svg'));
  if (kind === 'publish') parsePublishPack(readArtifact(slug, '06-publish.md'));
  if (kind === 'render' && !hasArtifact(slug, `${slug}.mp4`, 'out')) throw new Error('Video belum tersedia.');
  setStep(slug, kind, 'approved'); return pipelineView(slug);
}
export async function cancelPipelineStep(slug: string, kind: StepKind) {
  const task = runtime().tasks.get(slug);
  if (task && task.kind !== kind) throw new Error('Langkah aktif berbeda.');
  task?.controller.abort();
  await cancelStepStream(slug, kind);
  const step = getSteps(slug).find(step => step.kind === kind);
  if (step?.status === 'running') setStep(slug, kind, 'failed', 'Dibatalkan pengguna.');
  return pipelineView(slug);
}
export function reviseStep(slug: string, kind: StepKind, notes: unknown) {
  if (runtime().tasks.has(slug)) throw new Error('Tunggu pekerjaan sebelumnya berhenti.');
  if (typeof notes !== 'string' || !notes.trim() || notes.length > 5000) throw new Error('Catatan revisi wajib diisi, maksimal 5000 karakter.');
  requestRevision(slug, kind, notes.trim()); return pipelineView(slug);
}
export function saveTextArtifact(slug: string, name: string, content: unknown) {
  const owner: Record<string, StepKind> = { '01-episode.md': 'script', '01-naskah.md': 'script', '02-naskah-tagged.md': 'tags', '06-publish.md': 'publish' };
  if (!owner[name]) throw new Error('File ini tidak dapat diedit melalui editor.');
  if (typeof content !== 'string' || !content.trim() || content.length > 200000) throw new Error('Isi file wajib diisi, maksimal 200000 karakter.');
  if (runtime().tasks.has(slug) || getSteps(slug).some(step => step.status === 'running')) throw new Error('Tunggu pekerjaan selesai sebelum mengedit.');
  if (name === '01-naskah.md') {
    const packet = readArtifact(slug, '01-episode.md');
    if (content.includes('```')) throw new Error('Narasi tidak boleh berisi pagar kode.');
    const replacement = packet.replace(/(^## Master Voice-over\s*\r?\n+```(?:text)?\s*\r?\n)[\s\S]*?(\r?\n```)/m, (_, before: string, after: string) => `${before}${content.trim()}${after}`);
    writeArtifact(slug, '01-episode.md', replacement);
  }
  if (owner[name] === 'publish') parsePublishPack(content);
  writeArtifact(slug, name, content);
  requestRevision(slug, owner[name], 'Hasil diedit manual. Periksa konsistensi dengan scene dan narasi sebelum lanjut.');
  if (owner[name] === 'script') validateScript(slug); else if (owner[name] === 'tags') validateTags(slug);
  setStep(slug, owner[name], 'review');
}
