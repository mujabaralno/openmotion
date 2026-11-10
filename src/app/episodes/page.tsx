import Link from "next/link";
import { EpisodeCreateForm } from "@/components/episode-create-form";
import { EpisodeSteps } from "@/components/episode-steps";
import { listEpisodes } from "@/server/episodes/repository";

export const dynamic = "force-dynamic";

const buttonClasses =
  "inline-flex w-fit items-center justify-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";

export default function EpisodesPage() {
  const episodes = listEpisodes();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-6">
        <p className="mb-1 text-xs font-bold tracking-[0.08em] text-blue-600 uppercase">
          Workflow Studio
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Episode
        </h1>
        <p className="mt-1 text-slate-600">
          Kelola produksi video dari naskah sampai render.
        </p>
      </header>

      <EpisodeCreateForm />

      <section
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        aria-labelledby="episode-list-heading"
      >
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="episode-list-heading"
            className="text-lg font-semibold text-slate-900"
          >
            Daftar episode
          </h2>
          <span className="text-sm text-slate-500">
            {episodes.length} episode
          </span>
        </div>

        {episodes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Belum ada episode. Buat episode pertama lewat formulir di atas.
          </p>
        ) : (
          <ul className="grid gap-3">
            {episodes.map((episode) => (
              <li
                className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4"
                key={episode.id}
              >
                <div>
                  <h3 className="text-lg font-semibold">
                    <Link
                      className="text-slate-900 hover:text-blue-700 hover:underline"
                      href={`/episodes/${episode.slug}`}
                    >
                      {episode.title}
                    </Link>
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {episode.topic || "Tanpa topik"} ·{" "}
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                      {episode.slug}
                    </code>
                  </p>
                </div>

                <EpisodeSteps steps={episode.steps} compact />

                <Link
                  className={buttonClasses}
                  href={`/episodes/${episode.slug}`}
                >
                  Buka episode
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
