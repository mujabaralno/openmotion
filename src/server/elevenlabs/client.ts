import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getSettings } from '../pipeline/settings.ts';
import { readArtifact, writeArtifact } from '../pipeline/files.ts';
import { runRenderWorker } from '../render/runner.ts';
import { redactText } from '../security/redact.ts';

export async function generateVoiceover(slug: string, signal: AbortSignal): Promise<void> {
  const settings = getSettings();
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('Isi ELEVENLABS_API_KEY di .env.local, lalu restart server.');
  if (!settings.voiceId) throw new Error('Pilih Voice ID pada Pengaturan terlebih dahulu.');
  const text = readArtifact(slug, '02-naskah-tagged.md').trim();
  if (!text || text.length > 10000) throw new Error('Narasi harus berisi 1 sampai 10000 karakter. Batas model juga berlaku.');
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(settings.voiceId)}${settings.timestamps ? '/with-timestamps' : ''}?output_format=mp3_44100_128`;
  const timeout = AbortSignal.timeout(180000);
  const response = await fetch(endpoint, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model_id: settings.modelId }), signal: AbortSignal.any([signal, timeout]) });
  if (!response.ok) {
    let detail = '';
    try { const body = await response.json(); detail = typeof body.detail?.message === 'string' ? body.detail.message : ''; } catch { /* use status */ }
    throw new Error(redactText(`ElevenLabs menolak permintaan (${response.status}). ${detail || 'Periksa model, Voice ID, batas teks, kredit, dan izin API key.'}`));
  }
  let audio: Buffer; let alignment: unknown = null;
  if (settings.timestamps) {
    const data = await response.json();
    if (typeof data.audio_base64 !== 'string' || !data.audio_base64) throw new Error('ElevenLabs tidak mengembalikan audio.');
    audio = Buffer.from(data.audio_base64, 'base64'); alignment = data.normalized_alignment ?? data.alignment ?? null;
  } else audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 100) throw new Error('Audio yang diterima kosong atau tidak valid.');
  const directory = path.join(process.cwd(), 'data', 'audio-staging');
  fs.mkdirSync(directory, { recursive: true });
  const candidate = path.join(directory, `${randomUUID()}.mp3`);
  try {
    fs.writeFileSync(candidate, audio, { mode: 0o600 });
    const { duration } = await runRenderWorker('probe', candidate, '', signal);
    if (!duration) throw new Error('Durasi audio tidak tersedia.');
    if (signal.aborted) throw new Error('Pekerjaan dibatalkan.');
    writeArtifact(slug, '03-voiceover.mp3', audio);
    writeArtifact(slug, '03-voiceover.timestamps.json', JSON.stringify({ alignment }, null, 2));
    writeArtifact(slug, '03-audio.json', JSON.stringify({ duration, voiceId: settings.voiceId, modelId: settings.modelId, characters: text.length, generatedAt: new Date().toISOString() }, null, 2));
  } finally { if (fs.existsSync(candidate)) fs.unlinkSync(candidate); }
}
