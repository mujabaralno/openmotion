import type { StepKind, StepStatus } from "../db/index.ts";

export type EpisodeStep = {
  kind: StepKind;
  status: StepStatus;
};

export type Episode = {
  id: number;
  slug: string;
  title: string;
  topic: string;
  createdAt: string;
  updatedAt: string;
  steps: EpisodeStep[];
};
