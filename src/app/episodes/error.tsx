"use client";

import Link from "next/link";

export default function EpisodesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      <section className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <p className="mb-1 text-xs font-bold tracking-[0.08em] text-blue-600 uppercase">
          Terjadi kesalahan
        </p>
        <h1 className="text-2xl font-bold text-slate-900">
          Gagal memuat episode
        </h1>
        <p className="mt-2 text-slate-600">
          Database atau workspace mungkin belum siap. Periksa log server,
          lalu coba lagi.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            Coba lagi
          </button>
          <Link
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            href="/episodes"
          >
            Kembali ke daftar
          </Link>
        </div>
      </section>
    </main>
  );
}
