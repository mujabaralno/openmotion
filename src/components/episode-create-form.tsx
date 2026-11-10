"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type CreateResponse = {
  episode?: { slug?: string };
  error?: string;
  fix?: string;
};

const inputClasses =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60";

const buttonClasses =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60";

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
      className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      onSubmit={handleSubmit}
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Episode baru</h2>
        <span className="text-sm text-slate-500">
          Slug dibuat otomatis dari judul.
        </span>
      </div>

      {error ? (
        <div
          className="mb-4 space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
          role="alert"
        >
          <p>{error}</p>
          {fix ? <p>{fix}</p> : null}
        </div>
      ) : null}

      <label className="mb-3 flex flex-col gap-1.5 text-sm font-semibold text-slate-800">
        <span>Judul</span>
        <input
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          required
          autoComplete="off"
          disabled={pending}
          placeholder="Misalnya: Misteri di balik pintu"
          className={inputClasses}
        />
      </label>

      <label className="mb-3 flex flex-col gap-1.5 text-sm font-semibold text-slate-800">
        <span>Topik</span>
        <textarea
          name="topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          maxLength={500}
          rows={3}
          disabled={pending}
          placeholder="Ringkasan singkat ide episode (opsional)"
          className={inputClasses}
        />
      </label>

      <button type="submit" disabled={pending} className={buttonClasses}>
        {pending ? "Menyimpan..." : "Buat episode"}
      </button>
    </form>
  );
}
