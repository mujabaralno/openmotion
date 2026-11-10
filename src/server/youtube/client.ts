import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { getDb } from '../db/index.ts';

export const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'];
export const YOUTUBE_CALLBACK = '/integrations/youtube/callback';
type Credentials = { accessToken: string; refreshToken: string; expiresAt: number };
type Connection = { credentials: string; channel_id: string | null; channel_title: string | null; synced_at: string | null; period_start: string | null; period_end: string | null };
export type YouTubeVideo = { id: string; title: string; description: string; published_at: string; views: number; watch_minutes: number; average_percentage: number; likes: number; comments: number; subscribers_gained: number };
const connection = () => getDb().prepare('SELECT * FROM youtube_connection WHERE id=1').get() as Connection | undefined;
export const youtubeConfigured = () => Boolean(process.env.YOUTUBE_CLIENT_ID?.trim() && process.env.YOUTUBE_CLIENT_SECRET?.trim());
function key(): Buffer {
  const directory = path.join(process.cwd(), 'data', 'runtime');
  for (const target of [path.dirname(directory), directory]) {
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Penyimpanan kunci YouTube tidak aman.');
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  }
  const file = path.join(directory, 'youtube-key');
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('Penyimpanan kunci YouTube tidak aman.');
  if (!fs.existsSync(file)) { try { fs.writeFileSync(file, randomBytes(32), { flag: 'wx', mode: 0o600 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; } }
  const value = fs.readFileSync(file);
  if (value.length !== 32) throw new Error('Kunci penyimpanan YouTube tidak valid.');
  return value;
}
export function encryptCredentials(value: Credentials): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
}
function decryptCredentials(value: string): Credentials {
  try {
    const [iv, tag, encrypted] = value.split('.').map(part => Buffer.from(part, 'base64url'));
    const cipher = createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8'));
  } catch { throw new Error('Koneksi YouTube tidak dapat dibaca. Hubungkan ulang akun.'); }
}
const stateHash = (state: string) => createHash('sha256').update(state).digest('hex');
export function beginYouTubeConnection(origin: string) {
  if (!youtubeConfigured()) throw new Error('Isi YOUTUBE_CLIENT_ID dan YOUTUBE_CLIENT_SECRET di .env.local, lalu restart aplikasi.');
  const state = randomBytes(32).toString('base64url'); const verifier = randomBytes(48).toString('base64url');
  const redirectUri = origin + YOUTUBE_CALLBACK;
  getDb().prepare('DELETE FROM youtube_oauth WHERE expires_at < ?').run(Date.now());
  getDb().prepare('INSERT INTO youtube_oauth (state_hash,verifier,redirect_uri,expires_at) VALUES (?,?,?,?)').run(stateHash(state), verifier, redirectUri, Date.now() + 10 * 60_000);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID!, redirect_uri: redirectUri, response_type: 'code', scope: YOUTUBE_SCOPES.join(' '), access_type: 'offline', prompt: 'consent select_account', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
  return { state, url: url.toString() };
}
async function tokenRequest(body: Record<string, string>) {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...body, client_id: process.env.YOUTUBE_CLIENT_ID!, client_secret: process.env.YOUTUBE_CLIENT_SECRET! }), signal: AbortSignal.timeout(30_000) });
  const result = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!response.ok || !result.access_token) throw new Error('Otorisasi YouTube gagal atau sudah kedaluwarsa. Hubungkan ulang dan pastikan kedua API diaktifkan.');
  return result;
}
export async function completeYouTubeConnection(state: string, cookieState: string | undefined, code: string) {
  if (!state || state !== cookieState || !/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4096) throw new Error('Sesi koneksi YouTube tidak valid. Mulai lagi dari halaman Riset.');
  const pending = getDb().prepare('DELETE FROM youtube_oauth WHERE state_hash=? AND expires_at>? RETURNING verifier,redirect_uri').get(stateHash(state), Date.now()) as {verifier:string;redirect_uri:string} | undefined;
  if (!pending) throw new Error('Sesi koneksi YouTube kedaluwarsa atau sudah digunakan.');
  const result = await tokenRequest({ code, code_verifier: pending.verifier, redirect_uri: pending.redirect_uri, grant_type: 'authorization_code' });
  const scopes = new Set(result.scope?.split(' '));
  if (!YOUTUBE_SCOPES.every(scope => scopes.has(scope)) || !result.refresh_token) throw new Error('Izinkan akses baca channel dan statistik YouTube, lalu hubungkan ulang.');
  const credentials: Credentials = { accessToken: result.access_token!, refreshToken: result.refresh_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
  const channel = await channelInfo(credentials.accessToken);
  getDb().transaction(() => {
    getDb().prepare('DELETE FROM youtube_videos').run();
    getDb().prepare('INSERT OR REPLACE INTO youtube_connection (id,credentials,channel_id,channel_title) VALUES (1,?,?,?)').run(encryptCredentials(credentials), channel.id, channel.title);
    getDb().prepare("DELETE FROM research_knowledge WHERE kind='youtube'").run();
  })();
}
async function accessToken(): Promise<string> {
  const saved = connection();
  if (!saved) throw new Error('Hubungkan akun YouTube terlebih dahulu.');
  const credentials = decryptCredentials(saved.credentials);
  if (credentials.expiresAt > Date.now() + 60_000) return credentials.accessToken;
  const fresh = await tokenRequest({ refresh_token: credentials.refreshToken, grant_type: 'refresh_token' });
  credentials.accessToken = fresh.access_token!; credentials.refreshToken = fresh.refresh_token ?? credentials.refreshToken; credentials.expiresAt = Date.now() + (fresh.expires_in ?? 3600) * 1000;
  getDb().prepare('UPDATE youtube_connection SET credentials=? WHERE id=1 AND credentials=?').run(encryptCredentials(credentials), saved.credentials);
  return credentials.accessToken;
}
async function api<T>(base: string, params: Record<string, string>, token: string): Promise<T> {
  const response = await fetch(`${base}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(response.status === 401 ? 'Sesi YouTube berakhir. Hubungkan ulang akun.' : response.status === 403 ? 'YouTube menolak akses. Periksa izin akun, aktivasi YouTube Data API v3/YouTube Analytics API, dan kuota di Google Cloud.' : 'Statistik YouTube belum dapat diambil. Coba sinkronkan lagi.');
  return response.json() as Promise<T>;
}
async function channelInfo(token: string) {
  const result = await api<{items?:{id:string;snippet:{title:string}}[]}>('https://www.googleapis.com/youtube/v3/channels', { part: 'snippet', mine: 'true' }, token);
  const channel = result.items?.[0];
  if (!channel) throw new Error('Akun ini belum memiliki channel YouTube yang bisa dibaca.');
  return { id: channel.id, title: channel.snippet.title };
}
let syncing = false;
export async function syncYouTube() {
  if (syncing) throw new Error('Sinkronisasi YouTube masih berjalan.');
  syncing = true;
  try {
    const saved = connection(); if (!saved) throw new Error('Hubungkan akun YouTube terlebih dahulu.');
    const token = await accessToken();
    const end = new Date(); end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - 89);
    const periodStart = start.toISOString().slice(0, 10), periodEnd = end.toISOString().slice(0, 10);
    const report = await api<{columnHeaders?:{name:string}[];rows?:(string|number)[][]}>('https://youtubeanalytics.googleapis.com/v2/reports', { ids: `channel==${saved.channel_id}`, startDate: periodStart, endDate: periodEnd, dimensions: 'video', metrics: 'views,estimatedMinutesWatched,averageViewPercentage,likes,comments,subscribersGained', sort: '-views', maxResults: '50' }, token);
    const headers = report.columnHeaders?.map(column => column.name) ?? [];
    const rows = (report.rows ?? []).map(row => Object.fromEntries(headers.map((name, index) => [name, row[index]])));
    const ids = rows.map(row => String(row.video)).filter(id => /^[A-Za-z0-9_-]{11}$/.test(id));
    const metadata = ids.length ? await api<{items?:{id:string;snippet:{title:string;description:string;publishedAt:string}}[]}>('https://www.googleapis.com/youtube/v3/videos', { part: 'snippet', id: ids.join(',') }, token) : { items: [] };
    const metricNames = ['views','estimatedMinutesWatched','averageViewPercentage','likes','comments','subscribersGained'];
    if ((report.rows?.length ?? 0) > 0 && !['video', ...metricNames].every(name => headers.includes(name))) throw new Error('Kolom laporan YouTube belum lengkap. Data sebelumnya dipertahankan.');
    const validNumber = (value: unknown) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Nilai laporan YouTube tidak valid. Data sebelumnya dipertahankan.'); return value; };
    getDb().transaction(() => {
      // A disconnect or a new account connection while the requests ran must win.
      const current = connection();
      if (!current || current.channel_id !== saved.channel_id) throw new Error('Koneksi YouTube berubah. Sinkronkan kembali.');
      getDb().prepare('DELETE FROM youtube_videos').run();
      const insert = getDb().prepare('INSERT INTO youtube_videos (id,title,description,published_at,views,watch_minutes,average_percentage,likes,comments,subscribers_gained) VALUES (?,?,?,?,?,?,?,?,?,?)');
      for (const row of rows) {
        const video = metadata.items?.find(item => item.id === row.video); if (!video) continue;
        insert.run(video.id, video.snippet.title.slice(0, 500), video.snippet.description.slice(0, 5000), video.snippet.publishedAt, ...metricNames.map(name => validNumber(row[name])));
      }
      getDb().prepare('UPDATE youtube_connection SET synced_at=?,period_start=?,period_end=? WHERE id=1').run(new Date().toISOString(), periodStart, periodEnd);
    })();
    return youtubeStatus();
  } finally { syncing = false; }
}
export function youtubeStatus() {
  const saved = connection();
  return { configured: youtubeConfigured(), connected: Boolean(saved), channelId: saved?.channel_id ?? null, channelTitle: saved?.channel_title ?? null, syncedAt: saved?.synced_at ?? null, periodStart: saved?.period_start ?? null, periodEnd: saved?.period_end ?? null, syncing, videos: getDb().prepare('SELECT * FROM youtube_videos ORDER BY views DESC LIMIT 50').all() as YouTubeVideo[] };
}
export function disconnectYouTube() {
  getDb().transaction(() => { getDb().prepare('DELETE FROM youtube_connection').run(); getDb().prepare('DELETE FROM youtube_videos').run(); getDb().prepare('DELETE FROM youtube_oauth').run(); getDb().prepare("DELETE FROM research_knowledge WHERE kind='youtube'").run(); })();
}
