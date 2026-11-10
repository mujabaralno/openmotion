"use client";

import { useEffect } from "react";

export function SecurityBootstrap() {
  useEffect(() => {
    void fetch("/api/security/session", {
      credentials: "same-origin",
      cache: "no-store",
    });
  }, []);

  return null;
}
