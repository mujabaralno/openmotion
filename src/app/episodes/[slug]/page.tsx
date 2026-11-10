import Link from "next/link";
import { notFound } from "next/navigation";
import { EpisodeSteps } from "@/components/episode-steps";
import { getEpisodeBySlug } from "@/server/episodes/repository";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function EpisodeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const episode = getEpisodeBySlug(slug);

  if (!episode) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      <nav className="mb-4">
        <Link
          className="text-sm font-medium text-blue-600 hover:underline"
          href="/episodes"
        >
          ← Kembali ke daftar episode
        </Link>
      </nav>

      <header className="mb-6">
        <p className="mb-1 text-xs font-bold tracking-[0.08em] text-blue-600 uppercase">
          Episode
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {episode.title}
        </h1>
        <p className="mt-1 text-slate-600">
          {episode.topic || "Tanpa topik"}
        </p>

        <dl className="mt-5 flex flex-wrap gap-5">
          <div>
            <dt className="text-xs font-bold tracking-[0.06em] text-slate-500 uppercase">
              Slug
            </dt>
            <dd className="mt-1 text-sm text-slate-700">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                {episode.slug}
              </code>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold tracking-[0.06em] text-slate-500 uppercase">
              Dibuat
            </dt>
            <dd className="mt-1 text-sm text-slate-700">
              {formatDate(episode.createdAt)}
            </dd>
          </div>
        </dl>
      </header>

      <section
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        aria-labelledby="step-status-heading"
      >
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="step-status-heading"
            className="text-lg font-semibold text-slate-900"
          >
            Status produksi
          </h2>
          <span className="text-sm text-slate-500">
            Sumber status: database SQLite
          </span>
        </div>
        <EpisodeSteps steps={episode.steps} />
      </section>
    </main>
  );
}
