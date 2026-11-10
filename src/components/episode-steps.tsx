import { cn } from "@/lib/utils";
import { STATUS_LABELS, STEP_LABELS } from "@/lib/episode-labels";
import type { EpisodeStep } from "@/server/episodes/types";

type EpisodeStepsProps = {
  steps: EpisodeStep[];
  compact?: boolean;
};

const COMPACT_STEP_LABELS: Record<EpisodeStep["kind"], string> = {
  script: "Naskah",
  tags: "Emosi",
  voiceover: "Voice",
  scenes: "Scene",
  render: "Render",
  thumbnail: "Thumbnail",
  publish: "Publikasi",
};

const STATUS_META: Record<
  EpisodeStep["status"],
  { dot: string; text: string; line: string }
> = {
  idle: {
    dot: "bg-border",
    text: "text-muted-foreground",
    line: "bg-border",
  },
  running: {
    dot: "bg-primary animate-soft-pulse",
    text: "text-primary",
    line: "bg-primary/50",
  },
  review: {
    dot: "bg-amber-600",
    text: "text-amber-700",
    line: "bg-amber-600/40",
  },
  approved: {
    dot: "bg-emerald-700",
    text: "text-emerald-800",
    line: "bg-emerald-700/40",
  },
  failed: {
    dot: "bg-destructive",
    text: "text-destructive",
    line: "bg-destructive/40",
  },
};

export function EpisodeSteps({ steps, compact = false }: EpisodeStepsProps) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada langkah tersimpan.
      </p>
    );
  }

  if (compact) {
    return (
      <ul
        className="grid grid-cols-7 gap-1.5"
        aria-label="Status langkah produksi"
      >
        {steps.map((step) => {
          const meta = STATUS_META[step.status];

          return (
            <li key={step.kind} className="min-w-0">
              <span className={cn("block h-px w-full", meta.line)} />
              <div className="mt-2 flex min-w-0 items-center gap-1.5">
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", meta.dot)}
                />
                <span className="truncate font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                  {COMPACT_STEP_LABELS[step.kind]}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ol
      className="grid gap-0 sm:grid-cols-5"
      aria-label="Status langkah produksi"
    >
      {steps.map((step, index) => {
        const meta = STATUS_META[step.status];

        return (
          <li
            key={step.kind}
            className="relative border-t border-border pt-4 sm:pr-5"
          >
            <span
              className={cn(
                "absolute -top-[3px] left-0 size-1.5 rounded-full",
                meta.dot,
              )}
            />
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  "font-mono text-[9px] uppercase tracking-[0.1em]",
                  meta.text,
                )}
              >
                {STATUS_LABELS[step.status]}
              </span>
            </div>
            <p className="mt-3 text-sm font-medium tracking-[-0.01em] text-foreground">
              {STEP_LABELS[step.kind]}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
