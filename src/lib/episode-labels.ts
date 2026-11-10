import type { StepKind, StepStatus } from "@/server/db/index";

export const STEP_LABELS: Record<StepKind, string> = {
  script: "Naskah",
  tags: "Tag emosi",
  voiceover: "Voice-over",
  scenes: "Scene",
  render: "Render",
};

export const STATUS_LABELS: Record<StepStatus, string> = {
  idle: "Belum mulai",
  running: "Berjalan",
  review: "Perlu review",
  approved: "Disetujui",
  failed: "Gagal",
};
