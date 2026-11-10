export type AgentStreamErrorCode =
  | "invalid-kind"
  | "invalid-request"
  | "already-running"
  | "invalid-log-path"
  | "start-failed";

export class AgentStreamError extends Error {
  readonly code: AgentStreamErrorCode;

  constructor(code: AgentStreamErrorCode, message: string) {
    super(message);
    this.name = "AgentStreamError";
    this.code = code;
  }
}

export type PermissionErrorCode =
  | "invalid-decision"
  | "not-found"
  | "not-pending"
  | "no-active-session"
  | "log-failed";

export class PermissionError extends Error {
  readonly code: PermissionErrorCode;

  constructor(code: PermissionErrorCode, message: string) {
    super(message);
    this.name = "PermissionError";
    this.code = code;
  }
}
