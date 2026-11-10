export type AcpUpdate = {
  sessionUpdate: string;
  content?: { type?: string; text?: string };
  toolCallId?: string;
  status?: string;
  [key: string]: unknown;
};

export type AcpPermissionOption = {
  optionId: string;
  name: string;
  kind: string;
};

export type AcpPermissionRequest = {
  sessionId: string;
  toolCall?: {
    toolCallId?: string;
    title?: string;
    kind?: string;
  };
  options: AcpPermissionOption[];
};

export type AcpPermissionDecision =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" };

export type AcpPromptResult = {
  appSessionId: string;
  acpSessionId: string;
  stopReason: string;
  updates: AcpUpdate[];
};
