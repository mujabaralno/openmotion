import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { evaluateRequest } from "./server/security/guard";
import {
  createSecurityPolicy,
  TOKEN_COOKIE_NAME,
  TOKEN_HEADER_NAME,
} from "./server/security/policy";

function forbidden() {
  return NextResponse.json(
    { error: "Forbidden" },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export function proxy(request: NextRequest) {
  const policy = createSecurityPolicy();
  const headerToken = request.headers.get(TOKEN_HEADER_NAME);
  const cookieToken =
    request.cookies.get(TOKEN_COOKIE_NAME)?.value ?? null;

  const decision = evaluateRequest(
    {
      method: request.method,
      host: request.headers.get("host"),
      origin: request.headers.get("origin"),
      token: headerToken ?? cookieToken,
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    policy,
  );

  if (!decision.allowed) {
    return forbidden();
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");

  if (policy.token) {
    response.cookies.set({
      name: TOKEN_COOKIE_NAME,
      value: policy.token,
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
