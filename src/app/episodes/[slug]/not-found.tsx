import Link from "next/link";

export default function EpisodeNotFound() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      <section className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <p className="mb-1 text-xs font-bold tracking-[0.08em] text-blue-600 uppercase">
          404
        </p>
        <h1 className="text-2xl font-bold text-slate-900">
          Episode tidak ditemukan
        </h1>
        <p className="mt-2 text-slate-600">
          Episode ini mungkin sudah dihapus atau slug-nya salah.
        </p>
        <Link
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          href="/episodes"
        >
          Kembali ke daftar episode
        </Link>
      </section>
    </main>
  );
}
