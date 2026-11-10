import type { AcpPermissionOption, AcpUpdate } from "../acp/types.ts";
import type { StepKind } from "../db/index.ts";

export type AgentStreamStatus = "idle" | "running" | "completed" | "failed";

export type PermissionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "failed"
  | "expired";

export type PermissionDecisionSource = "manual" | "auto";

export type PermissionRecord = {
  id: string;
  attemptId: string;
  episodeSlug: string;
  stepKind: StepKind;
  stepId: number | null;
  title: string;
  summary: string;
  toolCallId?: string;
  toolKind?: string;
  input?: unknown;
  options: AcpPermissionOption[];
  status: PermissionStatus;
  decision?: "approved" | "rejected";
  decisionSource?: PermissionDecisionSource;
  auto: boolean;
  requestedAt: string;
  decidedAt?: string;
  error?: string;
};

export type AgentStreamStatusEvent = {
  seq: number;
  attemptId: string;
  type: "status";
  status: AgentStreamStatus;
  at: string;
  agentId?: string;
  stopReason?: string;
  error?: string;
};

export type AgentStreamPromptEvent = {
  seq: number;
  attemptId: string;
  type: "prompt";
  text: string;
  at: string;
};

export type AgentStreamUpdateEvent = {
  seq: number;
  attemptId: string;
  type: "update";
  update: AcpUpdate;
  at: string;
};

export type AgentStreamPermissionEvent = {
  seq: number;
  attemptId: string;
  type: "permission";
  permission: PermissionRecord;
  at: string;
};

export type AgentStreamPermissionModeEvent = {
  seq: number;
  attemptId: string;
  type: "permission-mode";
  enabled: boolean;
  at: string;
};

export type AgentStreamEvent =
  | AgentStreamStatusEvent
  | AgentStreamPromptEvent
  | AgentStreamUpdateEvent
  | AgentStreamPermissionEvent
  | AgentStreamPermissionModeEvent;
