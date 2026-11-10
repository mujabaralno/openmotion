"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDown, Bot, Check, CheckCircle2, ChevronDown,
  Clock3, Copy, FileText, RefreshCw, ShieldCheck, Square, Terminal, Wrench, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DocumentMarkdown } from "@/components/document-markdown";
import { LogoIntro } from "@/components/lottie";
import { useAgentSession } from "@/hooks/use-agent-session";
import { compactToolTitle, friendlySessionError, sessionPresentation, toolDisplayTitle, type SessionEntry } from "@/lib/agent-session";
import { STEP_LABELS } from "@/lib/episode-labels";
import type { PermissionRecord } from "@/server/agent-streams/types";
import type { StepKind, StepStatus } from "@/server/db";

type Tool = Extract<SessionEntry, { type: "tool" }>;
const toolStatus = (status: string) => ({ pending: "Menunggu", in_progress: "Berjalan", completed: "Selesai", failed: "Gagal" }[status] ?? status);
function permissionStatus(permission: PermissionRecord) {
  if (permission.status === "approved") return permission.decisionSource === "auto" ? "Disetujui otomatis" : "Disetujui";
  return { pending: "Menunggu izin", rejected: "Ditolak", expired: "Sesi berakhir", failed: "Gagal" }[permission.status];
}
function readableInput(input: unknown): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (typeof record.command === "string") return record.command;
    const path = record.file_path ?? record.path;
    if (typeof path === "string") return path + (typeof record.content === "string" ? `\n\n${record.content}` : "");
  }
  return input === undefined ? "" : JSON.stringify(input, null, 2);
}
function duration(start: string | null, end: string | null, now: number) {
  if (!start) return null;
  const seconds = Math.max(0, Math.floor(((end ? Date.parse(end) : now) - Date.parse(start)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function SessionError({ message }: { message: string }) {
  const friendly = friendlySessionError(message);
  return <div className="agent-error" role="alert"><AlertTriangle size={17} /><div><p>{friendly}</p>{message !== friendly ? <details><summary>Detail kesalahan</summary><pre>{message.replace(/\x1b\[[0-9;]*m/g, "")}</pre></details> : null}</div></div>;
}
const AgentMessage = memo(function AgentMessage({ text, streaming }: { text: string; streaming: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  }
  return <div className="agent-message"><div className="agent-message-author"><span className="agent-avatar"><Bot size={16} /></span><strong>Agen</strong>{streaming ? <span className="agent-message-live">Menulis</span> : null}</div><div className="agent-message-body">{streaming ? <div className="agent-streaming-text">{text}</div> : <DocumentMarkdown content={text} fileName="balasan agen" />}{!streaming ? <Button variant="ghost" size="xs" onClick={() => void copy()} aria-label="Salin balasan agen">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Tersalin" : "Salin"}</Button> : null}</div></div>;
});
function ToolActivity({ tool }: { tool: Tool }) {
  const Icon = tool.kind === "execute" ? Terminal : tool.kind === "read" || tool.kind === "edit" ? FileText : Wrench;
  return <details className="agent-tool" data-state={tool.status}><summary><span className="agent-tool-icon"><Icon size={15} /></span><span className="agent-tool-name" title={tool.title}>{toolDisplayTitle(tool)}</span><span className="agent-tool-status">{tool.status === "completed" ? <Check size={12} /> : tool.status === "failed" ? <X size={12} /> : null}{toolStatus(tool.status)}</span><ChevronDown size={13} className="agent-disclosure-arrow" /></summary><div className="agent-tool-detail"><p>{tool.title}</p>{tool.input !== undefined ? <pre>{readableInput(tool.input)}</pre> : null}{tool.output !== undefined ? <pre>{readableInput(tool.output)}</pre> : null}</div></details>;
}
function PermissionCard({ permission, deciding, connected, onDecide }: { permission: PermissionRecord; deciding: boolean; connected: boolean; onDecide: (id: string, decision: "approve" | "reject") => void }) {
  const input = readableInput(permission.input);
  return <article className="agent-permission"><div className="agent-permission-heading"><ShieldCheck size={18} /><div><strong>{compactToolTitle(permission.title)}</strong><p>Periksa tindakan ini sebelum memberi izin.</p></div></div>{input ? <pre className="agent-permission-input">{input}</pre> : null}<details className="agent-permission-details"><summary>Detail tindakan</summary><pre>{permission.summary}</pre></details>{permission.error ? <p className="agent-permission-error">{permission.error}</p> : null}<div className="agent-permission-actions"><span>{!connected ? "Menunggu koneksi tersambung" : deciding ? "Menyimpan keputusan…" : "Izin berlaku sekali untuk tindakan ini"}</span><div><Button variant="outline" disabled={deciding || !connected} onClick={() => onDecide(permission.id, "reject")}><X size={14} />Tolak</Button><Button disabled={deciding || !connected} onClick={() => onDecide(permission.id, "approve")}><Check size={14} />{deciding ? "Memproses…" : "Izinkan sekali"}</Button></div></div></article>;
}
function Conversation({ entries, running }: { entries: SessionEntry[]; running: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [jump, setJump] = useState(false);
  useEffect(() => {
    if (pinned.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [entries]);
  useEffect(() => {
    if (!content.current) return;
    const observer = new ResizeObserver(() => { if (pinned.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  function jumpToLatest() {
    pinned.current = true; setJump(false);
    viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  return <div className="agent-conversation-wrap"><div ref={viewport} className="agent-conversation" role="log" aria-label="Percakapan agen" aria-live="off" tabIndex={0} onScroll={event => { const element = event.currentTarget; pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72; setJump(!pinned.current); }}><div ref={content} className="agent-conversation-content">{entries.map((entry, index) => entry.type === "tool" ? <ToolActivity key={entry.id} tool={entry} /> : entry.type === "prompt" ? <details className="agent-instructions" key={entry.id}><summary><FileText size={14} /><span>Instruksi tahap</span><span className="agent-instructions-label">Dikirim aplikasi</span><ChevronDown size={13} className="agent-disclosure-arrow" /></summary><pre>{entry.text}</pre></details> : <AgentMessage key={entry.id} text={entry.text} streaming={running && index === entries.length - 1} />)}</div></div>{jump ? <Button className="agent-jump" variant="secondary" size="sm" onClick={jumpToLatest}><ArrowDown size={14} />Ke pesan terbaru</Button> : null}</div>;
}

export function AgentStreamView({ episodeSlug, kind, pipelineStatus, phase, starting = false, agentName, modelId, effort, onCancel, cancelling = false }: {
  episodeSlug: string; kind: StepKind; pipelineStatus?: StepStatus; phase?: string | null; starting?: boolean; agentName?: string | null; modelId?: string | null; effort?: string | null; onCancel?: () => void; cancelling?: boolean;
}) {
  const session = useAgentSession(episodeSlug, kind);
  const { state, connection } = session;
  const [now, setNow] = useState(() => Date.now());
  const running = state.status === "running" || (state.status === "idle" && pipelineStatus === "running");
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const presentation = sessionPresentation(state, connection, { pipelineStatus, starting, phase, now });
  const pending = Object.values(state.permissions).filter(permission => permission.status === "pending" && running);
  const resolved = Object.values(state.permissions).filter(permission => permission.status !== "pending");
  const tools = state.entries.filter(entry => entry.type === "tool");
  const elapsed = duration(state.startedAt, state.finishedAt, now);
  const connected = connection === "open";
  const StatusIcon = presentation.kind === "waiting" ? ShieldCheck : presentation.kind === "completed" ? CheckCircle2 : presentation.kind === "failed" ? AlertTriangle : presentation.kind === "stopped" ? Square : presentation.kind === "reconnecting" ? RefreshCw : Bot;
  return <div className="agent-session" data-phase={presentation.kind}>
    <header className="agent-session-header"><div className="agent-session-identity"><span className="agent-session-brand">{presentation.animate && state.entries.length > 0 ? <LogoIntro size={40} /> : <StatusIcon size={21} />}</span><div><h3>{agentName || "Agen produksi"}</h3><p>{[modelId, effort ? `Effort ${effort}` : null].filter(Boolean).join(" · ") || STEP_LABELS[kind]}</p></div></div><div className="agent-session-header-actions"><span className="agent-connection" data-connected={connected}><i />{connected ? "Terhubung" : connection === "done" ? "Riwayat tersimpan" : connection === "connecting" ? "Menghubungkan" : "Koneksi terputus"}</span>{running && onCancel ? <Button variant="outline" size="sm" onClick={onCancel} disabled={cancelling}><Square size={12} />{cancelling ? "Menghentikan…" : "Hentikan"}</Button> : null}</div></header>
    <div className="agent-session-status"><span className="agent-status-symbol"><StatusIcon size={16} /></span><div role="status" aria-live="polite"><strong>{presentation.title}</strong><p>{presentation.description}</p></div>{elapsed ? <span className="agent-elapsed" aria-label={`Durasi sesi ${elapsed}`}><Clock3 size={12} />{elapsed}</span> : null}</div>
    {pending.length ? <section className="agent-permission-queue" aria-label="Tindakan menunggu izin">{pending.length > 1 ? <p>{pending.length} tindakan memerlukan keputusan</p> : null}{pending.map(permission => <PermissionCard key={permission.id} permission={permission} deciding={Boolean(session.deciding[permission.id])} connected={connected} onDecide={(id, decision) => void session.decide(id, decision)} />)}</section> : null}
    {session.actionError ? <SessionError message={session.actionError} /> : null}
    {state.error && presentation.kind !== "stopped" ? <SessionError message={state.error} /> : null}
    {state.entries.length ? <Conversation entries={state.entries} running={running && Boolean(state.lastTextAt) && now - Date.parse(state.lastTextAt!) < 6000} /> : <div className="agent-session-empty"><span className="agent-empty-mark">{presentation.animate ? <LogoIntro size={72} /> : <Bot size={30} />}</span><h4>{running || starting ? "Menyiapkan respons pertama" : presentation.kind === "loading" ? "Mengambil riwayat percakapan" : "Percakapan untuk tahap ini"}</h4><p>{running || starting ? "Agen dapat membaca instruksi dan menyiapkan pekerjaan sebelum mengirim teks." : "Pesan agen, aktivitas tool, dan hasil sesi akan tampil berurutan di sini."}</p></div>}
    {(connection === "error" || connection === "reconnecting") ? <div className="agent-reconnect"><p>Menyambung ulang tidak akan menjalankan prompt lagi.</p><Button variant="outline" size="sm" onClick={session.reconnect}><RefreshCw size={13} />Sambungkan kembali</Button></div> : null}
    <footer className="agent-session-footer"><div className="agent-auto-permission"><ShieldCheck size={15} /><label htmlFor={`agent-auto-${kind}`}>Izin otomatis</label><Switch id={`agent-auto-${kind}`} size="sm" checked={state.autoApprove} onCheckedChange={() => void session.toggleAutoApprove()} disabled={!running || !state.attemptId || !connected || session.autoPending} aria-label="Izin otomatis untuk sesi ini" /><span data-enabled={state.autoApprove}>{state.autoApprove ? "Aktif untuk sesi ini" : "Nonaktif"}</span></div><span className="agent-tool-count">{tools.length} aktivitas tool</span></footer>
    {state.autoApprove ? <p className="agent-auto-note">Permintaan berikutnya akan disetujui otomatis. Izin yang sudah menunggu tetap memerlukan keputusan manual.</p> : null}
    {resolved.length ? <details className="agent-permission-history"><summary><ShieldCheck size={13} /><span>Riwayat izin</span><span>{resolved.length} tindakan</span><ChevronDown size={13} className="agent-disclosure-arrow" /></summary><ul>{resolved.map(permission => <li key={permission.id}><span title={permission.title}>{compactToolTitle(permission.title)}</span><small data-status={permission.status}>{permissionStatus(permission)}</small></li>)}</ul></details> : null}
    {state.attemptId ? <details className="agent-session-details"><summary>Detail sesi<ChevronDown size={12} className="agent-disclosure-arrow" /></summary><dl><div><dt>Tahap</dt><dd>{STEP_LABELS[kind]}</dd></div><div><dt>ID sesi</dt><dd>{state.attemptId}</dd></div><div><dt>Pembaruan terakhir</dt><dd>{state.lastActivityAt ? new Date(state.lastActivityAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Belum ada"}</dd></div></dl></details> : null}
  </div>;
}
