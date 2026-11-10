"use client";
import { useEffect, useState } from "react";
import {
  Save,
  FolderOpen,
  Bot,
  AudioLines,
  FileText,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { studioRequest } from "@/lib/studio-api";
import type { StudioSettings as Settings } from "@/server/pipeline/settings";
import { AGENT_PRESETS } from "@/lib/agent-presets";

type Configuration = {
  settings: Settings;
  hasApiKey: boolean;
  workspace: string;
  workspaceError: string;
  files: Record<string, string>;
};
const tabs = [
  { id: "workspace", label: "Workspace", icon: FolderOpen },
  { id: "agents", label: "Agen", icon: Bot },
  { id: "voice", label: "Voice-over", icon: AudioLines },
  { id: "templates", label: "Template & panduan", icon: FileText },
];
export function StudioSettings() {
  const [data, setData] = useState<Configuration | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState("workspace");
  const [file, setFile] = useState("script.md");
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    studioRequest<Configuration>("/api/settings")
      .then((next) => {
        if (active) {
          setData(next);
          setSettings(next.settings);
          setText(next.files["script.md"] ?? "");
          setSavedText(next.files["script.md"] ?? "");
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const dirty = text !== savedText;
  useUnsavedChanges(dirty);
  function chooseFile(name: string) {
    if (dirty && !window.confirm("Perubahan belum disimpan. Ganti dokumen?"))
      return;
    setFile(name);
    setText(data?.files[name] ?? "");
    setSavedText(data?.files[name] ?? "");
    setNotice("");
  }
  function chooseTab(next: string) {
    if (
      dirty &&
      !window.confirm("Perubahan dokumen belum disimpan. Pindah bagian?")
    )
      return;
    setTab(next);
    const name =
      next === "agents"
        ? "agents.json"
        : next === "templates"
          ? "script.md"
          : file;
    setFile(name);
    setText(data?.files[name] ?? "");
    setSavedText(data?.files[name] ?? "");
    setNotice("");
    setError("");
  }
  async function save(document = false) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      if (document) {
        await studioRequest("/api/settings", "PUT", { file, content: text });
        setSavedText(text);
        setData((current) =>
          current
            ? { ...current, files: { ...current.files, [file]: text } }
            : current,
        );
      } else {
        await studioRequest("/api/settings", "PUT", settings);
      }
      setNotice("Pengaturan tersimpan.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Gagal menyimpan.");
    } finally {
      setPending(false);
    }
  }
  function field(key: keyof Settings, value: string | boolean) {
    setSettings((current) =>
      current ? { ...current, [key]: value } : current,
    );
  }
  const configuredAgents = (() => {
    try {
      const parsed = JSON.parse(data?.files["agents.json"] ?? '{"agents":[]}');
      return Array.isArray(parsed.agents)
        ? (parsed.agents as { id: string; name: string }[])
        : [];
    } catch {
      return [];
    }
  })();
  async function addAgent(preset: (typeof AGENT_PRESETS)[number]) {
    if (dirty) {
      setError("Simpan perubahan konfigurasi sebelum menambahkan agen.");
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      const { content } = await studioRequest<{ content: string }>(
        "/api/settings",
        "PUT",
        { preset: preset.id },
      );
      setData((current) =>
        current
          ? { ...current, files: { ...current.files, "agents.json": content } }
          : current,
      );
      setFile("agents.json");
      setText(content);
      setSavedText(content);
      setNotice(
        `${preset.name} ditambahkan. Pilih agen ini pada episode untuk menjalankannya.`,
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Gagal menambahkan agen.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="studio-kicker">Konfigurasi studio</p>
          <h1>Pengaturan</h1>
          <p>Atur workspace, agen, suara, dan instruksi produksi.</p>
        </div>
      </div>
      <nav className="settings-tabs" aria-label="Bagian pengaturan">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => chooseTab(id)}
            aria-current={tab === id ? "page" : undefined}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>
      {error ? (
        <p className="studio-error" role="alert">
          <AlertTriangle size={16} />
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="studio-notice">
          <Check size={16} />
          {notice}
        </p>
      ) : null}
      {!data || !settings ? (
        <div className="editor-skeleton" aria-label="Memuat pengaturan">
          <i />
          <i />
          <i />
        </div>
      ) : (
        <section className="settings-surface">
          {tab === "workspace" ? (
            <div className="settings-content">
              <h2>Workspace lokal</h2>
              <p>
                Semua episode dan hasil produksi berada dalam satu folder kerja.
              </p>
              <label className="field-label">
                Lokasi workspace
                <input
                  className="studio-input"
                  readOnly
                  value={data.workspace || "WORKSPACE_DIR belum diisi"}
                />
                <small>
                  Lokasi dibaca dari WORKSPACE_DIR di .env.local. Restart server
                  setelah menggantinya.
                </small>
              </label>
              {data.workspaceError ? (
                <p className="studio-error">{data.workspaceError}</p>
              ) : (
                <div className="workspace-tree">
                  <code>episodes/</code>
                  <span>
                    Paket episode, narasi, audio, log, dan hasil video
                  </span>
                  <code>agents/</code>
                  <span>Skill parallax dan referensi produksi</span>
                  <code>prompts/</code>
                  <span>Instruksi tiap tahap</span>
                  <code>guide/</code>
                  <span>Panduan visual</span>
                  <code>agents.json</code>
                  <span>Konfigurasi agen coding</span>
                </div>
              )}
              <div className="settings-divider" />
              <h3>Identitas produksi</h3>
              <div className="settings-fields">
                <label className="field-label">
                  Nama seri
                  <input
                    className="studio-input"
                    value={settings.series}
                    onChange={(e) => field("series", e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Bahasa narasi
                  <input
                    className="studio-input"
                    value={settings.language}
                    onChange={(e) => field("language", e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Bahasa teks scene
                  <input
                    className="studio-input"
                    value={settings.captionsLanguage}
                    onChange={(e) => field("captionsLanguage", e.target.value)}
                  />
                  <small>
                    Mengatur judul dan label scene. Caption sinkron mengikuti
                    bahasa narasi.
                  </small>
                </label>
              </div>
              <Button onClick={() => void save()} disabled={pending}>
                <Save />
                {pending ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          ) : null}
          {tab === "voice" ? (
            <div className="settings-content">
              <h2>Voice-over ElevenLabs</h2>
              <p>
                Satu track audio utuh untuk setiap episode. API key tetap di
                server.
              </p>
              <span
                className={`status-badge ${data.hasApiKey ? "status-approved" : "status-failed"}`}
              >
                {data.hasApiKey ? "API key tersedia" : "API key belum diisi"}
              </span>
              {!data.hasApiKey ? (
                <p className="muted-copy">
                  Isi ELEVENLABS_API_KEY pada .env.local lalu restart server.
                </p>
              ) : null}
              <div className="settings-fields">
                <label className="field-label">
                  Voice ID
                  <input
                    className="studio-input"
                    value={settings.voiceId}
                    onChange={(e) => field("voiceId", e.target.value)}
                    placeholder="Voice ID dari akun ElevenLabs"
                  />
                </label>
                <label className="field-label">
                  Model ID
                  <input
                    className="studio-input"
                    value={settings.modelId}
                    onChange={(e) => field("modelId", e.target.value)}
                    placeholder="eleven_v3"
                  />
                  <small>
                    Gunakan model yang mendukung audio tags dan tersedia di
                    akunmu.
                  </small>
                </label>
              </div>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={settings.timestamps}
                  onChange={(e) => field("timestamps", e.target.checked)}
                />
                <span>
                  Minta timestamp untuk sinkronisasi caption
                  <small>
                    Jika model tidak mendukung endpoint timestamp, nonaktifkan
                    opsi ini. Timing caption pengganti merupakan perkiraan.
                  </small>
                </span>
              </label>
              <Button onClick={() => void save()} disabled={pending}>
                <Save />
                {pending ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          ) : null}
          {tab === "agents" ? (
            <div className="settings-content">
              <h2>Agen produksi</h2>
              <p>
                Tambahkan agen yang ingin dipakai. Model dan effort dipilih pada
                setiap tahap episode.
              </p>
              <div className="agent-presets">
                {AGENT_PRESETS.map((preset) => {
                  const added = configuredAgents.some(
                    (agent) => agent.id === preset.id,
                  );
                  return (
                    <article className="agent-preset" key={preset.id}>
                      <div>
                        <h3>{preset.name}</h3>
                        <p>{preset.description}</p>
                      </div>
                      <Button
                        variant="secondary"
                        disabled={pending || added}
                        onClick={() => void addAgent(preset)}
                      >
                        {added ? (
                          <>
                            <Check />
                            Ditambahkan
                          </>
                        ) : (
                          "Tambahkan"
                        )}
                      </Button>
                    </article>
                  );
                })}
              </div>
              <p className="muted-copy">
                Gunakan login CLI yang sudah tersedia di komputer ini. Claude
                Code dan Codex memakai adapter ACP; adapter akan diunduh saat
                pertama dihubungkan.
              </p>
              <div className="settings-divider" />
              <label className="field-label">
                Agen utama
                <select
                  className="studio-input"
                  value={settings.agentId}
                  onChange={(e) => field("agentId", e.target.value)}
                >
                  <option value="">Agen pertama yang terdaftar</option>
                  {settings.agentId &&
                  !configuredAgents.some(
                    (agent) => agent.id === settings.agentId,
                  ) ? (
                    <option value={settings.agentId}>
                      {settings.agentId} (tidak terdaftar)
                    </option>
                  ) : null}
                  {configuredAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <small>
                  Pilihan awal untuk episode baru. Kamu tetap dapat menggantinya
                  pada setiap tahap.
                </small>
              </label>
              <Button onClick={() => void save()} disabled={pending}>
                <Save />
                Simpan pilihan
              </Button>
              <details className="agent-advanced">
                <summary>Konfigurasi lanjutan · agents.json</summary>
                <label className="field-label">
                  Konfigurasi agen
                  <Textarea
                    className="config-editor"
                    spellCheck={false}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={15}
                  />
                </label>
                <p className="muted-copy">
                  Tambahkan agen ACP lain atau sesuaikan perintahnya.
                  Pertahankan mode izin manual.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => void save(true)}
                  disabled={pending || !dirty}
                >
                  <Save />
                  Simpan konfigurasi
                </Button>
              </details>
            </div>
          ) : null}
          {tab === "templates" ? (
            <div className="settings-content">
              <h2>Template & panduan</h2>
              <p>
                Instruksi ini dipakai saat agen menjalankan setiap tahap.
                Pertahankan nama variabel dan kontrak file keluarannya.
              </p>
              <label className="field-label">
                Dokumen
                <select
                  className="studio-input"
                  value={file}
                  onChange={(e) => chooseFile(e.target.value)}
                >
                  {[
                    "script.md",
                    "tags.md",
                    "scenes.md",
                    "style-parallax.md",
                  ].map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <Textarea
                className="config-editor"
                spellCheck={false}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={20}
                aria-label={`Editor ${file}`}
              />
              <p className="muted-copy">
                Skill lengkap ada di agents/shorts-episode-parallax/ dalam
                workspace. File yang telah disesuaikan tidak ditimpa saat
                aplikasi dijalankan ulang.
              </p>
              <Button
                onClick={() => void save(true)}
                disabled={pending || !dirty}
              >
                <Save />
                {pending ? "Menyimpan..." : "Simpan dokumen"}
              </Button>
            </div>
          ) : null}
        </section>
      )}
    </>
  );
}
