"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AlertIcon, ArrowUpRightIcon, PlusIcon } from "@/components/icons";

type CreateResponse = {
  episode?: { slug?: string };
  error?: string;
  fix?: string;
};

const inputClasses =
  "w-full border-0 border-b border-border bg-transparent px-0 py-3 text-2xl font-medium tracking-[-0.03em] text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";

const topicClasses =
  "min-h-24 w-full resize-y rounded-xl border border-border bg-card/60 px-3.5 py-3 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60";

export function EpisodeCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fix, setFix] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) return;

    const cleanTitle = title.trim();

    if (!cleanTitle) {
      setError("Judul wajib diisi.");
      setFix(null);
      return;
    }

    setPending(true);
    setError(null);
    setFix(null);

    try {
      const session = await fetch("/api/security/session", {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!session.ok) {
        throw new Error(
          "Sesi keamanan tidak siap. Muat ulang halaman lalu coba lagi.",
        );
      }

      const response = await fetch("/api/episodes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cleanTitle,
          topic: topic.trim(),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | CreateResponse
        | null;
      const slug = data?.episode?.slug;

      if (!response.ok || !slug) {
        setError(data?.error ?? "Gagal membuat episode. Coba lagi.");
        setFix(data?.fix ?? null);
        return;
      }

      router.push(`/episodes/${slug}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal membuat episode. Coba lagi.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="border-t border-border pt-6"
      onSubmit={handleSubmit}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
            01 / Brief
          </p>
          <h2 className="mt-1 text-xl font-medium tracking-[-0.03em] text-foreground">
            Episode baru
          </h2>
        </div>
        <span className="pb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          Slug otomatis
        </span>
      </div>

      {error ? (
        <div
          className="mt-5 flex gap-3 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-3.5 py-3 text-sm text-destructive"
          role="alert"
        >
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p>{error}</p>
            {fix ? <p className="text-destructive/80">{fix}</p> : null}
          </div>
        </div>
      ) : null}

      <label className="mt-7 grid gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Judul
        </span>
        <input
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          required
          autoComplete="off"
          disabled={pending}
          placeholder="Misteri di balik pintu"
          className={inputClasses}
        />
        <span className="text-xs leading-relaxed text-muted-foreground">
          Judul ini tampil di arsip dan menjadi dasar slug episode.
        </span>
      </label>

      <label className="mt-6 grid gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Topik
        </span>
        <textarea
          name="topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          maxLength={500}
          rows={3}
          disabled={pending}
          placeholder="Ringkasan singkat ide episode. Opsional."
          className={topicClasses}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="group mt-6 inline-flex w-full items-center justify-between gap-3 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all duration-300 hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-52"
      >
        <span className="flex items-center gap-2.5">
          {pending ? (
            <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <PlusIcon className="size-4" />
          )}
          {pending ? "Menyiapkan episode..." : "Buat episode"}
        </span>
        <ArrowUpRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </button>

      <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        Data lokal / SQLite / workspace
      </p>
    </form>
  );
}
