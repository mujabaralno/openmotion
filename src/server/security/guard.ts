export type SecurityPolicy = {
  allowedHosts: ReadonlySet<string>;
  allowedOrigins: ReadonlySet<string>;
  token: string | null;
};

export type RequestSecurityInput = {
  method: string;
  host: string | null;
  origin: string | null;
  token: string | null;
  secFetchSite?: string | null;
};

export type DenialReason =
  | "host"
  | "origin"
  | "cross-site"
  | "missing-origin"
  | "token";

export type SecurityDecision =
  | { allowed: true }
  | { allowed: false; reason: DenialReason };

export type GuardedAction<T> =
  | { allowed: true; value: T }
  | { allowed: false; reason: DenialReason };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function tokensMatch(candidate: string, expected: string): boolean {
  if (candidate.length !== expected.length) return false;

  let difference = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return difference === 0;
}

export function isStateChangingMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function evaluateRequest(
  input: RequestSecurityInput,
  policy: SecurityPolicy,
): SecurityDecision {
  if (!input.host || !policy.allowedHosts.has(input.host.toLowerCase())) {
    return { allowed: false, reason: "host" };
  }

  if (input.secFetchSite?.toLowerCase() === "cross-site") {
    return { allowed: false, reason: "cross-site" };
  }

  if (input.origin !== null && !policy.allowedOrigins.has(input.origin)) {
    return { allowed: false, reason: "origin" };
  }

  if (isStateChangingMethod(input.method)) {
    if (!input.origin) {
      return { allowed: false, reason: "missing-origin" };
    }

    if (!input.token || !policy.token || !tokensMatch(input.token, policy.token)) {
      return { allowed: false, reason: "token" };
    }
  }

  return { allowed: true };
}

export function guardAction<T>(
  input: RequestSecurityInput,
  policy: SecurityPolicy,
  action: () => T,
): GuardedAction<T> {
  const decision = evaluateRequest(input, policy);

  if (!decision.allowed) {
    return decision;
  }

  return { allowed: true, value: action() };
}
