"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Film, Search, Play, FileText } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { StudioModal } from "./studio-modal";
import { studioRequest } from "@/lib/studio-api";
import { STEP_LABELS, STATUS_LABELS } from "@/lib/episode-labels";
import type { Episode } from "@/server/episodes/types";
import type { StepStatus } from "@/server/db";

function overall(episode: Episode): StepStatus {
  if (episode.steps.some((s) => s.status === "running")) return "running";
  if (episode.steps.some((s) => s.status === "failed")) return "failed";
  if (episode.steps.some((s) => s.status === "review")) return "review";
  if (episode.steps.every((s) => s.status === "approved")) return "approved";
  return "idle";
}
export function EpisodeDashboard({
  initialEpisodes,
}: {
  initialEpisodes: Episode[];
}) {
  const router = useRouter();
  const [episodes, setEpisodes] = useState(initialEpisodes);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setInterval(() => {
      void studioRequest<{ episodes: Episode[] }>("/api/episodes")
        .then((data) => {
          if (active) setEpisodes(data.episodes);
        })
        .catch(() => {});
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const data = await studioRequest<{ episode: Episode }>(
        "/api/episodes",
        "POST",
        {
          title: title.trim() || topic.trim().slice(0, 120),
          topic: topic.trim(),
        },
      );
      router.push(`/episodes/${data.episode.slug}`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Gagal membuat episode.",
      );
    } finally {
      setPending(false);
    }
  }
  const filtered = episodes.filter((e) =>
    `${e.title} ${e.topic}`.toLowerCase().includes(query.toLowerCase()),
  );
  const featured =
    episodes.find((e) => overall(e) === "review" || overall(e) === "running") ??
    episodes[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="studio-kicker">Ruang produksi</p>
          <h1>Episode</h1>
          <p>Mulai dari satu topik. Selesaikan menjadi satu video.</p>
        </div>
        <Button size="lg" onClick={() => setOpen(true)}>
          <Plus />
          Buat episode
        </Button>
      </div>
      {featured ? (
        <section className="continue-panel">
          <div>
            <p className="studio-kicker">Lanjutkan produksi</p>
            <h2>{featured.title}</h2>
            <div className="inline-meta">
              <span className={`status-badge status-${overall(featured)}`}>
                {STATUS_LABELS[overall(featured)]}
              </span>
              <span>
                {featured.steps.filter((s) => s.status === "approved").length}{" "}
                dari {featured.steps.length} langkah disetujui
              </span>
            </div>
            <Link
              className="studio-link-button"
              href={`/episodes/${featured.slug}`}
            >
              <ArrowRight size={16} />
              Buka episode
            </Link>
          </div>
          <div className="continue-art">
            <Film size={54} strokeWidth={1} />
            <span>
              {
                STEP_LABELS[
                  (
                    featured.steps.find((s) => s.status !== "approved") ??
                    featured.steps[4]
                  ).kind
                ]
              }
            </span>
            <div className="mini-pipeline">
              {featured.steps.map((s) => (
                <i
                  key={s.kind}
                  className={`mini-step state-${s.status}`}
                  title={`${STEP_LABELS[s.kind]}: ${STATUS_LABELS[s.status]}`}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <section>
        <div className="list-heading">
          <h2>
            Semua episode <span className="muted-count">{episodes.length}</span>
          </h2>
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Cari episode"
              placeholder="Cari episode..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {!filtered.length ? (
          <div className="studio-empty">
            <span className="empty-icon">
              <FileText size={26} />
            </span>
            <h3>
              {query
                ? "Episode tidak ditemukan"
                : "Episode pertamamu dimulai di sini"}
            </h3>
            <p>
              {query
                ? "Coba judul atau topik lainnya."
                : "Masukkan topik. Agen akan menyiapkan paket episode untuk kamu tinjau."}
            </p>
            {!query ? (
              <Button onClick={() => setOpen(true)}>
                <Plus />
                Buat episode
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="episode-table">
            <div className="episode-table-heading">
              <span>Episode</span>
              <span>Status</span>
              <span>Alur</span>
              <span>Diperbarui</span>
              <span />
            </div>
            {filtered.map((e) => (
              <Link
                className="episode-table-row"
                key={e.id}
                href={`/episodes/${e.slug}`}
              >
                <div className="episode-name">
                  <span className="episode-icon">
                    <Play size={16} />
                  </span>
                  <div>
                    <strong>{e.title}</strong>
                    <small>{e.slug}</small>
                  </div>
                </div>
                <span className={`status-badge status-${overall(e)}`}>
                  {STATUS_LABELS[overall(e)]}
                </span>
                <div className="mini-pipeline">
                  {e.steps.map((s) => (
                    <i
                      key={s.kind}
                      className={`mini-step state-${s.status}`}
                      title={`${STEP_LABELS[s.kind]}: ${STATUS_LABELS[s.status]}`}
                    />
                  ))}
                </div>
                <time dateTime={e.updatedAt}>
                  {new Intl.DateTimeFormat("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(
                    new Date(
                      e.updatedAt.includes("T")
                        ? e.updatedAt
                        : e.updatedAt + "Z",
                    ),
                  )}
                </time>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        )}
      </section>
      <StudioModal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Buat episode"
      >
        <form onSubmit={create} className="studio-form">
          <p className="form-intro">
            Topik menjadi bahan paket episode, narasi, dan scene parallax.
          </p>
          <label>
            Topik
            <Textarea
              required
              maxLength={500}
              rows={4}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Kenapa bawang membuat mata berair?"
              disabled={pending}
            />
          </label>
          <label>
            Judul{" "}
            <span className="field-hint">Opsional, otomatis dari topik</span>
            <input
              className="studio-input"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={pending}
            />
          </label>
          {error ? (
            <p role="alert" className="studio-error">
              {error}
            </p>
          ) : null}
          <div className="modal-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : "Buat episode"}
            </Button>
          </div>
        </form>
      </StudioModal>
    </>
  );
}
