import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type StudioSettings = { agentId: string; voiceId: string; modelId: string; series: string; language: string; captionsLanguage: string; timestamps: boolean };
const file = () => path.join(process.cwd(), 'data', 'settings.json');
export function getSettings(): StudioSettings {
  let saved: Partial<StudioSettings> = {};
  try { const parsed = JSON.parse(fs.readFileSync(file(), 'utf8')); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed; } catch { /* defaults on first start */ }
  return {
    agentId: saved.agentId ?? '', voiceId: saved.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? '',
    modelId: saved.modelId || process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_v3',
    series: saved.series ?? 'Everyday Why', language: saved.language ?? 'English',
    captionsLanguage: saved.captionsLanguage ?? 'English', timestamps: saved.timestamps ?? true,
  };
}
export function saveSettings(input: unknown): StudioSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Pengaturan harus berupa objek.');
  const current = getSettings();
  for (const key of ['agentId', 'voiceId', 'modelId', 'series', 'language', 'captionsLanguage'] as const) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) {
      if (typeof value !== 'string' || value.length > 160 || /[\x00-\x1f]/.test(value)) throw new Error(`Nilai ${key} tidak valid.`);
      current[key] = value.trim();
    }
  }
  const timestamps = (input as Record<string, unknown>).timestamps;
  if (timestamps !== undefined) { if (typeof timestamps !== 'boolean') throw new Error('Pengaturan timestamp tidak valid.'); current.timestamps = timestamps; }
  if (!current.modelId || !current.series || !current.language || !current.captionsLanguage) throw new Error('Model, seri, dan bahasa wajib diisi.');
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const temporary = `${file()}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(current, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file());
  return current;
}
