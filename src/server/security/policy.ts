import type { SecurityPolicy } from "./guard";
import { readServerToken } from "./token";

export const TOKEN_COOKIE_NAME = "workflow_studio_token";
export const TOKEN_HEADER_NAME = "x-workflow-token";

export type SecurityPolicyOptions = {
  port?: string;
  token?: string | null;
};

export function getAppPort(): string {
  return process.env.APP_PORT ?? process.env.PORT ?? "3000";
}

export function createSecurityPolicy(
  options: SecurityPolicyOptions = {},
): SecurityPolicy {
  const port = options.port ?? getAppPort();
  const token =
    options.token === undefined ? readServerToken() : options.token;

  return {
    allowedHosts: new Set([
      `127.0.0.1:${port}`,
      `localhost:${port}`,
    ]),
    allowedOrigins: new Set([
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
    ]),
    token,
  };
}
