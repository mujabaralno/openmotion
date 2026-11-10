"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  LockKeyhole,
  Play,
  RotateCcw,
  Square,
  Save,
  Download,
  FileText,
  AudioLines,
  Film,
  ChevronRight,
  AlertTriangle,
  Eye,
  PencilLine,
} from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { AgentStreamView } from "./agent-chat-panel";
import { StudioModal } from "./studio-modal";
import { DocumentMarkdown } from "./document-markdown";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { studioRequest } from "@/lib/studio-api";
import { STEP_LABELS, STATUS_LABELS } from "@/lib/episode-labels";
import type { StepKind } from "@/server/db";
import type { pipelineView } from "@/server/pipeline/service";
import type {
  AgentExecutionOptions,
  AgentSelector,
} from "@/server/acp/configuration";

type View = ReturnType<typeof pipelineView>;
const kinds: StepKind[] = ["script", "tags", "voiceover", "scenes", "render"];
const descriptions: Record<StepKind, string> = {
  script:
    "Agen menyiapkan naskah, prompt scene, layer map, camera plan, dan master narasi.",
  tags: "Master narasi diberi tag emosi dengan mempertahankan seluruh kata dan urutannya.",
  voiceover: "Hasilkan satu audio utuh dari narasi bertag melalui ElevenLabs.",
  scenes:
    "Agen merakit visual di proyek Remotion utama dari paket episode dan audio. Preview dibuat sebelum persetujuan.",
  render:
    "Render video final, tinjau hasilnya, lalu setujui atau minta revisi scene.",
};
const fileChoices: Record<string, string[]> = {
  script: ["01-episode.md", "01-naskah.md"],
  tags: ["02-naskah-tagged.md"],
};
type ExecutionChoice = { agentId: string; modelId: string; effort: string };
function SelectorOptions({ selector }: { selector: AgentSelector }) {
  return (
    <>
      {selector.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.group ? `${option.group} / ` : ""}
          {option.name}
        </option>
      ))}
    </>
  );
}
export function ProductionWorkspace({ initial }: { initial: View }) {
  const slug = initial.episode.slug;
  const [data, setData] = useState(initial);
  const [kind, setKind] = useState<StepKind>(
    initial.steps.find((s) => s.status !== "approved")?.kind ?? "render",
  );
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [agentId, setAgentId] = useState("");
  const [executionChoices, setExecutionChoices] = useState<
    Partial<Record<StepKind, ExecutionChoice>>
  >({});
  const [catalogs, setCatalogs] = useState<
    Record<string, { data?: AgentExecutionOptions; error?: string }>
  >({});
  const [catalogReload, setCatalogReload] = useState(0);
  const [pending, setPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState(fileChoices[kind]?.[0] ?? "");
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [loadedFileKey, setLoadedFileKey] = useState("");
  const [fileError, setFileError] = useState("");
  const [documentMode, setDocumentMode] = useState<"preview" | "edit">("preview");
  const [revision, setRevision] = useState(false);
  const [notes, setNotes] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [voice, setVoice] = useState<{ modelId: string; voiceId: string }>({
    modelId: "",
    voiceId: "",
  });
  const mounted = useRef(true);
  const sessionSection = useRef<HTMLElement>(null);
  const refresh = useCallback(async () => {
    const next = await studioRequest<View>(
      `/api/episodes/${encodeURIComponent(slug)}/pipeline`,
    );
    if (mounted.current) {
      setData(next);
      setNotice((current) =>
        current === "Status belum tersambung. Mencoba lagi..." ? "" : current,
      );
    }
  }, [slug]);
  useEffect(() => {
    mounted.current = true;
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void refresh()
        .catch(() => {
          if (mounted.current)
            setNotice("Status belum tersambung. Mencoba lagi...");
        })
        .finally(() => {
          inFlight = false;
        });
    }, 2000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    Promise.all([
      studioRequest<{ agents: { id: string; name: string }[] }>("/api/agents"),
      studioRequest<{
        settings: { agentId: string; modelId: string; voiceId: string };
      }>("/api/settings"),
    ])
      .then(([a, s]) => {
        if (!active) return;
        setAgents(a.agents);
        setAgentId(s.settings.agentId || a.agents[0]?.id || "");
        setVoice(s.settings);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const step = data.steps.find((s) => s.kind === kind)!;
  const dirty = content !== saved;
  const busy =
    Boolean(data.task) || data.steps.some((s) => s.status === "running");
  const unlocked = data.steps
    .slice(0, kinds.indexOf(kind))
    .every((s) => s.status === "approved");
  const agentStage = ["script", "tags", "scenes"].includes(kind);
  const execution = executionChoices[kind] ?? {
    agentId: step.agentId || agentId,
    modelId: step.modelId ?? "",
    effort: step.effort ?? "",
  };
  const catalogKey = JSON.stringify([
    kind,
    execution.agentId,
    execution.modelId,
  ]);
  const catalog = catalogs[catalogKey];
  const model = catalog?.data?.model;
  const effort = catalog?.data?.effort;
  useEffect(() => {
    if (!agentStage || !execution.agentId || busy || catalog) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      studioRequest<AgentExecutionOptions>(
        `/api/episodes/${encodeURIComponent(slug)}/steps/${kind}/options`,
        "POST",
        {
          agentId: execution.agentId,
          ...(execution.modelId ? { modelId: execution.modelId } : {}),
        },
        controller.signal,
      )
        .then((result) => {
          if (active)
            setCatalogs((current) => ({
              ...current,
              [catalogKey]: { data: result },
            }));
        })
        .catch((error) => {
          if (active)
            setCatalogs((current) => ({
              ...current,
              [catalogKey]: {
                error:
                  error instanceof Error
                    ? error.message
                    : "Gagal memuat pilihan model.",
              },
            }));
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    slug,
    kind,
    agentStage,
    execution.agentId,
    execution.modelId,
    busy,
    catalogKey,
    catalog,
    catalogReload,
  ]);
  function changeExecution(change: Partial<ExecutionChoice>) {
    setExecutionChoices((current) => ({
      ...current,
      [kind]: { ...execution, ...change },
    }));
  }
  function reloadCatalog() {
    setCatalogs((current) => {
      const next = { ...current };
      delete next[catalogKey];
      return next;
    });
    setCatalogReload((current) => current + 1);
  }
  const mediaVersion =
    data.steps.find((s) => s.kind === "voiceover")?.finishedAt ?? "";
  const artifactVersion =
    data.steps.find((s) => s.kind === "tags")?.finishedAt ?? "";
  const selectedVersion = step.finishedAt;
  const fileKey = `${kind}:${file}:${selectedVersion ?? ""}`;
  const loadingFile = Boolean(file) && loadedFileKey !== fileKey;
  useEffect(() => {
    if (!file || !(fileChoices[kind] ?? []).includes(file)) return;
    let active = true;
    studioRequest<{ content: string }>(
      `/api/episodes/${encodeURIComponent(slug)}/files/${encodeURIComponent(file)}`,
    )
      .then((result) => {
        if (active) {
          setContent(result.content);
          setSaved(result.content);
          setFileError("");
        }
      })
      .catch((error) => {
        if (active) {
          setContent("");
          setSaved("");
          setFileError(error.message);
        }
      })
      .finally(() => {
        if (active) setLoadedFileKey(fileKey);
      });
    return () => {
      active = false;
    };
  }, [slug, file, kind, selectedVersion, fileKey]);
  useUnsavedChanges(dirty);
  function selectStage(next: StepKind) {
    if (dirty && !window.confirm("Perubahan belum disimpan. Pindah langkah?"))
      return;
    setKind(next);
    setFile(fileChoices[next]?.[0] ?? "");
    setDocumentMode("preview");
    setContent("");
    setSaved("");
    setError("");
    setNotice("");
  }
  async function action(
    name: "run" | "approve" | "revise" | "cancel",
    body: unknown = {},
  ) {
    if (pending) return;
    if (dirty && name !== "cancel") {
      setError("Simpan perubahan sebelum melanjutkan.");
      return;
    }
    setPending(true);
    setPendingAction(name);
    setError("");
    setNotice("");
    try {
      const next = await studioRequest<View>(
        `/api/episodes/${encodeURIComponent(slug)}/steps/${kind}/${name}`,
        "POST",
        body,
      );
      setData(next);
      if (name === "run" && agentStage) sessionSection.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      setRevision(false);
      setOverwrite(false);
      if (name === "approve" && kind !== "render") {
        const nextKind = kinds[kinds.indexOf(kind) + 1];
        setKind(nextKind);
        setFile(fileChoices[nextKind]?.[0] ?? "");
        setDocumentMode("preview");
        setContent("");
        setSaved("");
      }
      if (name === "approve" && kind === "render")
        setNotice("Episode selesai dan video final telah disetujui.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Permintaan gagal.");
    } finally {
      setPending(false);
      setPendingAction(null);
    }
  }
  function run() {
    if (kind === "voiceover" && data.files.includes("03-voiceover.mp3")) {
      setOverwrite(true);
      return;
    }
    void action(
      "run",
      agentStage
        ? {
            agentId: execution.agentId,
            modelId: execution.modelId || model?.currentValue || "",
            effort: execution.effort || effort?.currentValue || "",
          }
        : {},
    );
  }
  async function save() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await studioRequest(
        `/api/episodes/${encodeURIComponent(slug)}/files/${encodeURIComponent(file)}`,
        "PUT",
        { content },
      );
      setSaved(content);
      setNotice(
        "Tersimpan. Tinjau kembali hasil dan setujui untuk melanjutkan.",
      );
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Gagal menyimpan.");
    } finally {
      setPending(false);
    }
  }
  const [estimate, setEstimate] = useState(0);
  useEffect(() => {
    if (kind !== "voiceover") return;
    let active = true;
    studioRequest<{ content: string }>(
      `/api/episodes/${encodeURIComponent(slug)}/files/02-naskah-tagged.md`,
    )
      .then((d) => {
        if (active) setEstimate(d.content.length);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [slug, kind, artifactVersion]);
  return (
    <>
      <Link href="/episodes" className="back-link">
        <ArrowLeft size={15} />
        Semua episode
      </Link>
      <div className="episode-detail-heading">
        <h1>{data.episode.title}</h1>
        <p>{data.episode.topic}</p>
        <small>
          EP. {String(data.episode.id).padStart(3, "0")}
          <span>
            {data.steps.filter((s) => s.status === "approved").length} dari 5
            disetujui
          </span>
        </small>
      </div>
      <nav className="pipeline-navigation" aria-label="Tahap produksi">
        {data.steps.map((s, index) => {
          const locked = data.steps
            .slice(0, index)
            .some((previous) => previous.status !== "approved");
          return (
            <button
              key={s.kind}
              onClick={() => selectStage(s.kind)}
              aria-current={kind === s.kind ? "step" : undefined}
              className={kind === s.kind ? "selected" : ""}
            >
              <span className={`step-number state-${s.status}`}>
                {s.status === "approved" ? (
                  <Check size={16} />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </span>
              <span>
                <strong>{STEP_LABELS[s.kind]}</strong>
                <small>{locked ? "Terkunci" : STATUS_LABELS[s.status]}</small>
              </span>
              {locked ? <LockKeyhole size={15} className="step-lock" /> : null}
            </button>
          );
        })}
      </nav>
      <section className="production-heading">
        <div>
          <h2>{STEP_LABELS[kind]}</h2>
          <p>{descriptions[kind]}</p>
        </div>
        <span className={`status-badge status-${step.status}`}>
          {STATUS_LABELS[step.status]}
        </span>
      </section>
      {error || step.error ? (
        <p className="studio-error" role="alert">
          <AlertTriangle size={16} />
          {error || step.error}
        </p>
      ) : null}
      {notice ? (
        <p className="studio-notice" role="status">
          {notice}
        </p>
      ) : null}
      {!unlocked ? (
        <div className="locked-panel">
          <LockKeyhole size={24} />
          <h3>Langkah sebelumnya perlu disetujui</h3>
          <p>
            Kamu dapat membaca hasil yang tersedia. Selesaikan review tahap
            sebelumnya untuk menjalankan tahap ini.
          </p>
        </div>
      ) : null}
      <div className="production-grid">
        <div className="production-primary">
          {fileChoices[kind] ? (
            <section className="artifact-editor">
              <header>
                <div className="file-tabs">
                  {fileChoices[kind].map((name) => (
                    <button
                      key={name}
                      className={file === name ? "active" : ""}
                      onClick={() => {
                        if (
                          dirty &&
                          !window.confirm(
                            "Perubahan belum disimpan. Ganti file?",
                          )
                        )
                          return;
                        setFile(name);
                        setDocumentMode("preview");
                      }}
                    >
                      <FileText size={14} />
                      {name}
                    </button>
                  ))}
                </div>
                <div
                  className="document-mode"
                  role="group"
                  aria-label="Tampilan dokumen"
                >
                  <Button
                    size="xs"
                    variant={documentMode === "preview" ? "secondary" : "ghost"}
                    aria-pressed={documentMode === "preview"}
                    onClick={() => setDocumentMode("preview")}
                  >
                    <Eye size={13} />
                    Preview
                  </Button>
                  <Button
                    size="xs"
                    variant={documentMode === "edit" ? "secondary" : "ghost"}
                    aria-pressed={documentMode === "edit"}
                    onClick={() => setDocumentMode("edit")}
                  >
                    <PencilLine size={13} />
                    Edit
                  </Button>
                </div>
              </header>
              {loadingFile ? (
                <div className="editor-skeleton" aria-label="Memuat dokumen">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              ) : fileError ? (
                <div className="editor-empty">
                  <FileText size={30} />
                  <p>
                    {fileError.includes("belum tersedia")
                      ? "Dokumen akan muncul setelah agen menyelesaikan tahap ini."
                      : fileError}
                  </p>
                </div>
              ) : documentMode === "preview" ? (
                <DocumentMarkdown content={content} fileName={file} />
              ) : (
                <textarea
                  className="document-textarea"
                  aria-label={`Editor ${file}`}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  spellCheck={false}
                  disabled={busy || pending}
                />
              )}
              <footer>
                <span>
                  {dirty
                    ? "Perubahan belum disimpan"
                    : content
                      ? "Tersimpan di workspace"
                      : "Menunggu hasil agen"}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => void save()}
                  disabled={!dirty || busy || pending}
                >
                  <Save />
                  Simpan
                </Button>
              </footer>
            </section>
          ) : null}
          {kind === "voiceover" ? (
            <section className="audio-panel studio-panel">
              <header>
                <h3>
                  <AudioLines size={18} />
                  Voice-over
                </h3>
                <span className="technical-label">Satu audio utuh</span>
              </header>
              <div className="audio-content">
                <div className="audio-stats">
                  <div>
                    <small>Karakter termasuk tag</small>
                    <strong>{estimate.toLocaleString("id-ID")}</strong>
                  </div>
                  <div>
                    <small>Model</small>
                    <strong className="value-text">
                      {voice.modelId || "Belum diatur"}
                    </strong>
                  </div>
                  <div>
                    <small>Durasi hasil</small>
                    <strong>
                      {data.audio?.duration
                        ? `${data.audio.duration.toFixed(1)} dtk`
                        : "Belum tersedia"}
                    </strong>
                  </div>
                </div>
                <p className="muted-copy">
                  Jumlah karakter adalah perkiraan penggunaan. Kredit mengikuti
                  model dan paket ElevenLabs yang dipakai.
                </p>
                {data.files.includes("03-voiceover.mp3") ? (
                  <audio
                    key={mediaVersion}
                    controls
                    preload="metadata"
                    src={`/api/media/${slug}/03-voiceover.mp3?v=${encodeURIComponent(mediaVersion)}`}
                    aria-label="Voice-over episode"
                  />
                ) : (
                  <div className="audio-empty">
                    <AudioLines size={38} />
                    <p>Audio akan tersedia setelah generate selesai.</p>
                  </div>
                )}
                <Link href="/settings" className="text-link">
                  Atur voice dan model
                  <ChevronRight size={14} />
                </Link>
              </div>
            </section>
          ) : null}
          {kind === "scenes" || kind === "render" ? (
            <section className="studio-panel video-panel">
              <header>
                <h3>
                  <Film size={17} />
                  {kind === "scenes" ? "Preview komposisi" : "Video final"}
                </h3>
                <small>9:16 / 30 FPS</small>
              </header>
              <div className="video-stage">
                {(
                  kind === "scenes"
                    ? data.previewAvailable
                    : data.videoAvailable
                ) ? (
                  <video
                    key={`${kind}-${step.finishedAt}`}
                    controls
                    preload="metadata"
                    playsInline
                    src={`/api/media/${slug}/${kind === "scenes" ? "preview.mp4" : `${slug}.mp4`}?v=${encodeURIComponent(step.finishedAt ?? "")}`}
                    aria-label={
                      kind === "scenes"
                        ? "Preview episode"
                        : "Video final episode"
                    }
                  />
                ) : (
                  <div className="video-empty">
                    <Film size={42} />
                    <p>
                      {step.status === "running"
                        ? "Video sedang disiapkan."
                        : "Video akan muncul setelah tahap ini selesai."}
                    </p>
                  </div>
                )}
              </div>
              {data.scenes?.captionsEstimated ? (
                <p className="stale-note">
                  Timing caption merupakan perkiraan. Aktifkan timestamp
                  ElevenLabs untuk penyelarasan yang lebih tepat.
                </p>
              ) : null}
              {step.status === "idle" &&
              (kind === "scenes"
                ? data.previewAvailable
                : data.videoAvailable) ? (
                <p className="stale-note">
                  Hasil sebelumnya. Jalankan ulang untuk menggunakan revisi
                  terbaru.
                </p>
              ) : null}
              {kind === "render" && data.videoAvailable ? (
                <footer>
                  <span>
                    {step.status === "approved"
                      ? "Video final disetujui"
                      : "Tinjau video sebelum menyetujui."}
                  </span>
                  <a
                    className="text-link"
                    href={`/api/media/${slug}/${slug}.mp4?download`}
                  >
                    <Download size={15} />
                    Unduh MP4
                  </a>
                </footer>
              ) : null}
            </section>
          ) : null}
          {data.task && data.task.kind === kind ? (
            <div className="task-progress" role="status">
              <div>
                <span>{data.task.phase}</span>
                {data.task.progress > 0 ? (
                  <strong>{Math.round(data.task.progress * 100)}%</strong>
                ) : null}
              </div>
              {data.task.progress > 0 ? (
                <progress
                  max={1}
                  value={data.task.progress}
                  aria-label="Progres render"
                />
              ) : (
                <div className="working-indicator">
                  <i />
                  <span>Proses berjalan. Halaman boleh di-refresh.</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
        <aside className="production-aside">
          <section className="studio-panel">
            <header>
              <h3>{agentStage ? "Agen produksi" : "Serah terima"}</h3>
            </header>
            <div className="panel-body">
              {agentStage ? (
                <div className="execution-settings">
                  <label className="field-label">
                    Agen
                    <select
                      className="studio-input"
                      value={execution.agentId}
                      onChange={(event) =>
                        changeExecution({
                          agentId: event.target.value,
                          modelId: "",
                          effort: "",
                        })
                      }
                      disabled={busy || pending}
                      aria-label="Agen produksi"
                    >
                      {!agents.length ? (
                        <option value="">Belum ada agen</option>
                      ) : null}
                      {execution.agentId &&
                      !agents.some(
                        (agent) => agent.id === execution.agentId,
                      ) ? (
                        <option value={execution.agentId}>
                          {execution.agentId} (tidak terdaftar)
                        </option>
                      ) : null}
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Model
                    <select
                      className="studio-input"
                      value={execution.modelId || model?.currentValue || ""}
                      onChange={(event) =>
                        changeExecution({
                          modelId: event.target.value,
                          effort: "",
                        })
                      }
                      disabled={busy || pending || !model}
                      aria-label="Model agen"
                    >
                      {model ? (
                        <SelectorOptions selector={model} />
                      ) : (
                        <option value={execution.modelId}>
                          {busy
                            ? step.modelId || "Default agen"
                            : catalog?.error
                              ? "Pilihan belum tersedia"
                              : catalog?.data
                                ? "Default agen"
                                : "Memuat model…"}
                        </option>
                      )}
                    </select>
                  </label>
                  <label className="field-label">
                    Effort
                    <select
                      className="studio-input"
                      value={execution.effort || effort?.currentValue || ""}
                      onChange={(event) =>
                        changeExecution({ effort: event.target.value })
                      }
                      disabled={busy || pending || !effort}
                      aria-label="Effort agen"
                    >
                      {effort ? (
                        <SelectorOptions selector={effort} />
                      ) : (
                        <option value={execution.effort}>
                          {busy
                            ? step.effort || "Default agen"
                            : catalog?.data
                              ? "Tidak tersedia untuk model ini"
                              : "Menunggu model…"}
                        </option>
                      )}
                    </select>
                    <small>
                      Effort lebih rendah biasanya lebih cepat. Pilihan
                      mengikuti dukungan model.
                    </small>
                  </label>
                  {!busy && !catalog && execution.agentId ? (
                    <p className="muted-copy" role="status">
                      Menghubungkan agen untuk membaca model dan effort. Belum
                      mengirim naskah.
                    </p>
                  ) : null}
                  {catalog?.error ? (
                    <div className="execution-error">
                      <p className="studio-error" role="alert">
                        {catalog.error}
                      </p>
                      <Button
                        variant="outline"
                        onClick={reloadCatalog}
                        disabled={busy || pending}
                      >
                        Muat ulang pilihan
                      </Button>
                      {execution.modelId ? (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            changeExecution({ modelId: "", effort: "" })
                          }
                          disabled={busy || pending}
                        >
                          Pilih ulang model
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {catalog?.data && !model ? (
                    <p className="muted-copy">
                      Agen ini belum menyediakan pemilihan model melalui ACP.
                      Menjalankan tahap akan memakai model default agen.
                    </p>
                  ) : null}
                  {catalog?.data ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={reloadCatalog}
                      disabled={busy || pending}
                    >
                      Segarkan daftar model
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div className="handoff-list">
                <span className="technical-label">Masukan</span>
                {(kind === "script"
                  ? ["Topik episode", "Skill parallax"]
                  : kind === "tags"
                    ? ["Master narasi", "Paket episode"]
                    : kind === "voiceover"
                      ? ["Narasi bertag", "Voice dan model"]
                      : kind === "scenes"
                        ? ["Paket episode", "Audio dan timestamp"]
                        : ["Komposisi disetujui"]
                ).map((name) => (
                  <div className="handoff-item" key={name}>
                    <FileText size={15} />
                    {name}
                  </div>
                ))}
              </div>
              {kind === "scenes" ? (
                <p className="muted-copy">
                  Proyek: <code>remotion/</code><br />
                  Source episode: <code className="break-all">src/episodes/{slug}/Episode.tsx</code>
                </p>
              ) : null}
              {step.notes ? (
                <div className="revision-note">
                  <span className="technical-label">Catatan revisi</span>
                  <p>{step.notes}</p>
                </div>
              ) : null}
              <p className="muted-copy">
                {agentStage
                  ? "Tindakan agen menunggu izinmu di panel sesi."
                  : "Hasil disimpan di folder episode dan tetap tersedia setelah refresh."}
              </p>
            </div>
          </section>
          {!agents.length && agentStage ? (
            <p className="studio-error">
              Tambahkan agen melalui <Link href="/settings">Pengaturan</Link>.
            </p>
          ) : null}
        </aside>
      </div>
      <footer className="production-actions">
        <p>
          <FileText size={16} />
          {dirty
            ? "Simpan perubahan sebelum melanjutkan."
            : step.status === "approved"
              ? "Hasil ini sudah disetujui."
              : step.status === "review"
                ? "Periksa hasil sebelum membuka langkah berikutnya."
                : "Setiap hasil melewati review kamu."}
        </p>
        <div>
          {step.status === "running" ? (
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => void action("cancel")}
            >
              <Square />
              Batalkan
            </Button>
          ) : (
            <>
              {step.status === "review" || step.status === "approved" ? (
                <Button
                  variant="outline"
                  disabled={pending || busy || dirty}
                  onClick={() => {
                    setNotes("");
                    setRevision(true);
                  }}
                >
                  <RotateCcw />
                  Minta revisi
                </Button>
              ) : null}
              {step.status === "idle" || step.status === "failed" ? (
                <Button
                  disabled={
                    !unlocked ||
                    busy ||
                    pending ||
                    (agentStage && (!execution.agentId || !catalog?.data))
                  }
                  onClick={run}
                >
                  <Play />
                  {pending
                    ? "Memulai..."
                    : step.status === "failed"
                      ? "Coba lagi"
                      : kind === "voiceover"
                        ? "Generate audio"
                        : kind === "render"
                          ? "Render video"
                          : "Jalankan agen"}
                </Button>
              ) : null}
              {step.status === "review" ? (
                <Button
                  disabled={pending || busy || dirty}
                  onClick={() => void action("approve")}
                >
                  <Check />
                  {kind === "render" ? "Setujui video" : "Setujui & lanjut"}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </footer>
      {agentStage ? (
        <section className="agent-session-section" ref={sessionSection}>
          <h2>Sesi agen</h2>
          <p className="muted-copy">
            Keluaran langsung, aktivitas tool, dan permintaan izin.
          </p>
          <AgentStreamView
            key={`${kind}-${step.sessionRef ?? "idle"}`}
            episodeSlug={slug}
            kind={kind}
            pipelineStatus={step.status}
            phase={data.task?.kind === kind ? data.task.phase : null}
            starting={pendingAction === "run"}
            agentName={agents.find(agent => agent.id === step.agentId)?.name ?? step.agentId}
            modelId={step.modelId}
            effort={step.effort}
            onCancel={() => void action("cancel")}
            cancelling={pendingAction === "cancel"}
          />
        </section>
      ) : null}
      <StudioModal
        open={revision}
        onClose={() => {
          if (!pending) setRevision(false);
        }}
        title={kind === "render" ? "Minta revisi scene" : "Minta revisi"}
      >
        <form
          className="studio-form"
          onSubmit={(event) => {
            event.preventDefault();
            void action("revise", { notes });
          }}
        >
          <p className="form-intro">
            {kind === "render"
              ? "Revisi video membuka kembali tahap Rakit scene."
              : "Hasil tahap ini dan tahap setelahnya perlu ditinjau ulang."}
          </p>
          <label>
            Catatan revisi
            <Textarea
              required
              maxLength={5000}
              rows={5}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Jelaskan bagian yang perlu diperbaiki."
            />
          </label>
          <div className="modal-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevision(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button type="submit" disabled={pending || !notes.trim()}>
              Simpan revisi
            </Button>
          </div>
        </form>
      </StudioModal>
      <StudioModal
        open={overwrite}
        onClose={() => {
          if (!pending) setOverwrite(false);
        }}
        title="Generate ulang audio?"
      >
        <div className="studio-form">
          <p>
            Audio lama akan diganti setelah audio baru berhasil dibuat. Generate
            ulang menggunakan kredit ElevenLabs.
          </p>
          <div className="modal-actions">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setOverwrite(false)}
            >
              Batal
            </Button>
            <Button
              disabled={pending}
              onClick={() => void action("run", { overwrite: true })}
            >
              Generate ulang
            </Button>
          </div>
        </div>
      </StudioModal>
    </>
  );
}
