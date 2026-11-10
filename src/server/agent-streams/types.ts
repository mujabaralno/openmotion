import type { AcpUpdate } from "../acp/types.ts";

export type AgentStreamStatus = "idle" | "running" | "completed" | "failed";

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

export type AgentStreamEvent =
  | AgentStreamStatusEvent
  | AgentStreamPromptEvent
  | AgentStreamUpdateEvent;
