import { STATUS_LABELS, STEP_LABELS } from "@/lib/episode-labels";
import type { EpisodeStep } from "@/server/episodes/types";

type EpisodeStepsProps = {
  steps: EpisodeStep[];
  compact?: boolean;
};

const STATUS_CLASSES: Record<EpisodeStep["status"], string> = {
  idle: "bg-slate-200 text-slate-700",
  running: "bg-blue-100 text-blue-700",
  review: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

export function EpisodeSteps({ steps, compact = false }: EpisodeStepsProps) {
  if (steps.length === 0) {
    return <p className="text-sm text-slate-500">Belum ada langkah tersimpan.</p>;
  }

  return (
    <ul
      className={
        compact
          ? "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          : "grid gap-2"
      }
      aria-label="Status langkah produksi"
    >
      {steps.map((step) => (
        <li
          key={step.kind}
          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
        >
          <span className="text-sm text-slate-700">
            {STEP_LABELS[step.kind]}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_CLASSES[step.status]}`}
          >
            {STATUS_LABELS[step.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}
