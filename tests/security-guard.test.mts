import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRequest,
  guardAction,
  tokensMatch,
} from "../src/server/security/guard.ts";
import type { SecurityPolicy } from "../src/server/security/guard.ts";

const TOKEN = "a".repeat(64);
const policy: SecurityPolicy = {
  allowedHosts: new Set(["127.0.0.1:3000", "localhost:3000"]),
  allowedOrigins: new Set([
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ]),
  token: TOKEN,
};

const validPost = {
  method: "POST",
  host: "127.0.0.1:3000",
  origin: "http://127.0.0.1:3000",
  token: TOKEN,
};

test("mengizinkan permintaan sah dari aplikasi sendiri", () => {
  assert.deepEqual(evaluateRequest(validPost, policy), { allowed: true });
  assert.deepEqual(
    evaluateRequest(
      {
        ...validPost,
        host: "localhost:3000",
        origin: "http://localhost:3000",
      },
      policy,
    ),
    { allowed: true },
  );
});

test("menolak Host yang tidak ada di daftar", () => {
  assert.deepEqual(
    evaluateRequest({ ...validPost, host: "192.168.1.2:3000" }, policy),
    { allowed: false, reason: "host" },
  );
  assert.deepEqual(
    evaluateRequest({ ...validPost, host: "127.0.0.1:3001" }, policy),
    { allowed: false, reason: "host" },
  );
  assert.deepEqual(evaluateRequest({ ...validPost, host: null }, policy), {
    allowed: false,
    reason: "host",
  });
});

test("menolak Origin yang tidak ada di daftar", () => {
  assert.deepEqual(
    evaluateRequest(
      { ...validPost, origin: "https://evil.example" },
      policy,
    ),
    { allowed: false, reason: "origin" },
  );
  assert.deepEqual(
    evaluateRequest(
      { ...validPost, origin: "http://127.0.0.1:3001" },
      policy,
    ),
    { allowed: false, reason: "origin" },
  );
});

test("menolak permintaan cross-site meskipun hanya membaca", () => {
  assert.deepEqual(
    evaluateRequest(
      {
        method: "GET",
        host: "127.0.0.1:3000",
        origin: null,
        token: null,
        secFetchSite: "cross-site",
      },
      policy,
    ),
    { allowed: false, reason: "cross-site" },
  );
});

test("membaca tanpa Origin diizinkan, menulis tanpa Origin ditolak", () => {
  const read = {
    method: "GET",
    host: "127.0.0.1:3000",
    origin: null,
    token: null,
  };

  assert.deepEqual(evaluateRequest(read, policy), { allowed: true });
  assert.deepEqual(
    evaluateRequest({ ...read, method: "HEAD" }, policy),
    { allowed: true },
  );
  assert.deepEqual(evaluateRequest({ ...read, method: "POST" }, policy), {
    allowed: false,
    reason: "missing-origin",
  });
  assert.deepEqual(evaluateRequest({ ...read, method: "PUT" }, policy), {
    allowed: false,
    reason: "missing-origin",
  });
  assert.deepEqual(evaluateRequest({ ...read, method: "PATCH" }, policy), {
    allowed: false,
    reason: "missing-origin",
  });
  assert.deepEqual(evaluateRequest({ ...read, method: "DELETE" }, policy), {
    allowed: false,
    reason: "missing-origin",
  });
});

test("menulis tanpa token atau dengan token salah ditolak", () => {
  assert.deepEqual(
    evaluateRequest({ ...validPost, token: null }, policy),
    { allowed: false, reason: "token" },
  );
  assert.deepEqual(
    evaluateRequest({ ...validPost, token: "b".repeat(64) }, policy),
    { allowed: false, reason: "token" },
  );
  assert.deepEqual(
    evaluateRequest({ ...validPost, token: "pendek" }, policy),
    { allowed: false, reason: "token" },
  );
});

test("membaca dengan Origin sendiri tetap diizinkan tanpa token", () => {
  assert.deepEqual(
    evaluateRequest(
      {
        method: "GET",
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        token: null,
      },
      policy,
    ),
    { allowed: true },
  );
});

test("token lama ditolak setelah restart (token baru dibuat)", () => {
  const restarted: SecurityPolicy = {
    ...policy,
    token: "c".repeat(64),
  };

  assert.deepEqual(evaluateRequest(validPost, restarted), {
    allowed: false,
    reason: "token",
  });
  assert.deepEqual(
    evaluateRequest({ ...validPost, token: "c".repeat(64) }, restarted),
    { allowed: true },
  );
});

test("aksi tidak dijalankan ketika guard menolak", () => {
  let executed = false;

  const rejected = guardAction(
    { ...validPost, origin: "https://evil.example" },
    policy,
    () => {
      executed = true;
      return "berubah";
    },
  );

  assert.deepEqual(rejected, { allowed: false, reason: "origin" });
  assert.equal(executed, false);

  const accepted = guardAction(validPost, policy, () => {
    executed = true;
    return "berhasil";
  });

  assert.deepEqual(accepted, { allowed: true, value: "berhasil" });
  assert.equal(executed, true);
});

test("perbandingan token tidak menerima nilai berbeda", () => {
  assert.equal(tokensMatch(TOKEN, TOKEN), true);
  assert.equal(tokensMatch(TOKEN, "b".repeat(64)), false);
  assert.equal(tokensMatch("pendek", TOKEN), false);
});
