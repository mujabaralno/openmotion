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
