import type { AgentStreamEvent, AgentStreamStatus, PermissionRecord } from '../server/agent-streams/types.ts';
import type { StepStatus } from '../server/db/index.ts';

export type SessionConnection = 'connecting' | 'open' | 'reconnecting' | 'done' | 'error';
export type SessionEntry =
  | { type: 'prompt' | 'message'; id: string; text: string; at: string; messageId?: string }
  | { type: 'tool'; id: string; title: string; status: string; kind?: string; input?: unknown; output?: unknown; locations?: unknown; at: string };
export type AgentSessionState = {
  attemptId: string | null;
  status: AgentStreamStatus;
  entries: SessionEntry[];
  permissions: Record<string, PermissionRecord>;
  autoApprove: boolean;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastActivityAt: string | null;
  lastTextAt: string | null;
};
export function emptyAgentSession(): AgentSessionState {
  return { attemptId: null, status: 'idle', entries: [], permissions: {}, autoApprove: false, error: null, startedAt: null, finishedAt: null, lastActivityAt: null, lastTextAt: null };
}
export function reduceAgentSession(previous: AgentSessionState, event: AgentStreamEvent): AgentSessionState {
  const fresh = Boolean(event.attemptId && event.attemptId !== previous.attemptId);
  const state = fresh ? { ...emptyAgentSession(), attemptId: event.attemptId, status: 'running' as const } : previous;
  const next = { ...state, lastActivityAt: event.at };
  if (event.type === 'prompt') return { ...next, startedAt: state.startedAt ?? event.at, entries: [...state.entries, { type: 'prompt', id: `${event.attemptId}:prompt:${event.seq}`, text: event.text, at: event.at }] };
  if (event.type === 'permission') return { ...next, permissions: { ...state.permissions, [event.permission.id]: event.permission } };
  if (event.type === 'permission-mode') return { ...next, autoApprove: event.enabled };
  if (event.type === 'status') {
    const terminal = event.status !== 'running';
    const permissions = terminal ? Object.fromEntries(Object.entries(state.permissions).map(([id, record]) => [id, record.status === 'pending' ? { ...record, status: 'expired' as const, decidedAt: event.at } : record])) : state.permissions;
    return { ...next, status: event.status, error: event.error ?? state.error, permissions, autoApprove: terminal ? false : state.autoApprove, startedAt: event.status === 'running' ? state.startedAt ?? event.at : state.startedAt, finishedAt: terminal ? event.at : null };
  }
  const update = event.update;
  if (update.sessionUpdate === 'agent_message_chunk' && update.content?.text) {
    const messageId = typeof update.messageId === 'string' ? update.messageId : 'default';
    const last = state.entries.at(-1);
    if (last?.type === 'message' && last.messageId === messageId) return { ...next, lastTextAt: event.at, entries: [...state.entries.slice(0, -1), { ...last, text: last.text + update.content.text }] };
    return { ...next, lastTextAt: event.at, entries: [...state.entries, { type: 'message', id: `${event.attemptId}:message:${event.seq}`, messageId, text: update.content.text, at: event.at }] };
  }
  if ((update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') && typeof update.toolCallId === 'string') {
    const index = state.entries.findIndex(entry => entry.type === 'tool' && entry.id === update.toolCallId);
    const old = index >= 0 && state.entries[index].type === 'tool' ? state.entries[index] as Extract<SessionEntry, {type:'tool'}> : undefined;
    const title = typeof update.title === 'string' && update.title.trim() ? update.title : old?.title ?? 'Aktivitas agen';
    const tool: Extract<SessionEntry, {type:'tool'}> = { type: 'tool', id: update.toolCallId, title: /^(read|write|edit|shell|list):?\s*$/i.test(title) && old?.title ? old.title : title, status: typeof update.status === 'string' ? update.status : old?.status ?? 'pending', kind: typeof update.kind === 'string' ? update.kind : old?.kind, input: update.rawInput ?? old?.input, output: update.content ?? old?.output, locations: update.locations ?? old?.locations, at: old?.at ?? event.at };
    const entries = [...state.entries];
    if (index >= 0) entries[index] = tool; else entries.push(tool);
    return { ...next, entries };
  }
  return next;
}

export function sessionPresentation(state: AgentSessionState, connection: SessionConnection, options: { pipelineStatus?: StepStatus; starting?: boolean; phase?: string | null; now?: number } = {}) {
  const running = state.status === 'running' || (state.status === 'idle' && options.pipelineStatus === 'running');
  if (options.starting) return { kind: 'working', title: 'Menghubungkan agen', description: 'Menyiapkan sesi, model, dan instruksi tahap ini.', animate: true } as const;
  if (connection === 'connecting') return { kind: 'loading', title: 'Memuat sesi', description: 'Mengambil riwayat dan status terbaru.', animate: true } as const;
  if (connection === 'reconnecting' || connection === 'error') return { kind: 'reconnecting', title: connection === 'error' ? 'Koneksi belum tersambung' : 'Menyambung kembali', description: 'Status terbaru agen belum dapat dipastikan. Riwayat akan dipulihkan setelah tersambung.', animate: false } as const;
  if (running && Object.values(state.permissions).some(permission => permission.status === 'pending')) return { kind: 'waiting', title: 'Menunggu izin Anda', description: 'Agen menunggu keputusan sebelum melanjutkan tindakan di bawah.', animate: false } as const;
  if (state.status === 'failed' || (state.status === 'idle' && options.pipelineStatus === 'failed')) {
    const cancelled = /dibatalkan|cancelled|dihentikan/i.test(state.error ?? '');
    return { kind: cancelled ? 'stopped' : 'failed', title: cancelled ? 'Sesi dihentikan' : 'Sesi mengalami kendala', description: cancelled ? 'Pekerjaan dihentikan. Riwayat sesi tetap tersedia.' : 'Periksa pesan kesalahan sebelum mencoba kembali.', animate: false } as const;
  }
  if (state.status === 'completed') return { kind: 'completed', title: 'Pekerjaan agen selesai', description: 'Tinjau hasil pada dokumen atau preview tahap ini sebelum menyetujuinya.', animate: false } as const;
  if (running) {
    const silent = state.lastActivityAt && (options.now ?? Date.now()) - Date.parse(state.lastActivityAt) >= 45000;
    const workingTool = state.entries.findLast(entry => entry.type === 'tool' && entry.status === 'in_progress');
    return { kind: 'working', title: options.phase?.includes('revi') ? options.phase : workingTool?.type === 'tool' ? 'Agen sedang menjalankan tool' : 'Agen sedang bekerja', description: silent ? 'Belum ada pembaruan baru. Sesi masih berstatus berjalan; Anda bisa menunggu atau menghentikannya.' : 'Keluaran dan aktivitas baru akan muncul otomatis di percakapan.', animate: true } as const;
  }
  return { kind: 'idle', title: 'Siap memulai', description: 'Pilih agen, model, dan effort, lalu jalankan tahap ini. Percakapan akan muncul di sini.', animate: false } as const;
}

export function compactToolTitle(title: string): string {
  return title.replace(/(?:\/[^\s"'|]+)+/g, value => {
    const parts = value.split('/').filter(Boolean);
    return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : value;
  }).replace(/\s+/g, ' ').trim().slice(0, 150);
}
export function toolDisplayTitle(tool: Extract<SessionEntry, {type:'tool'}>): string {
  if (!/^(read|write|edit|shell|list):?\s*$/i.test(tool.title)) return compactToolTitle(tool.title);
  const input = tool.input && typeof tool.input === 'object' ? tool.input as Record<string, unknown> : {};
  const firstLocation = Array.isArray(tool.locations) ? tool.locations.find(location => location && typeof location.path === 'string') : null;
  const target = input.file_path ?? input.path ?? input.command ?? firstLocation?.path;
  return compactToolTitle(typeof target === 'string' ? `${tool.title.replace(/:$/, '')}: ${target}` : tool.title);
}
export function friendlySessionError(error: string): string {
  if (/Missing optional dependency.*codex/i.test(error)) return 'Instalasi Codex belum lengkap sehingga agen tidak dapat dimulai.';
  if (/ENOENT|command not found|spawn.*not found/i.test(error)) return 'Perintah agen belum ditemukan. Periksa instalasi dan konfigurasi agen.';
  if (/auth|login|sign[ -]?in/i.test(error)) return 'Agen perlu login kembali. Jalankan login agen di terminal, lalu coba lagi.';
  return error.replace(/\x1b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 280);
}
