import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  generateToken,
  readServerToken,
  writeServerToken,
} from "../src/server/security/token.ts";

test("token dibuat acak, disimpan aman, dan diganti saat server restart", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "workflow-studio-token-"),
  );
  const tokenPath = path.join(directory, "runtime", "server-token");

  try {
    assert.equal(readServerToken(tokenPath), null);

    const first = writeServerToken(tokenPath);

    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(readServerToken(tokenPath), first);
    assert.equal(fs.statSync(tokenPath).mode & 0o777, 0o600);
    assert.equal(
      fs.statSync(path.dirname(tokenPath)).mode & 0o777,
      0o700,
    );

    const second = writeServerToken(tokenPath);

    assert.notEqual(second, first);
    assert.equal(readServerToken(tokenPath), second);
    assert.notEqual(generateToken(), generateToken());
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("file token yang tidak valid dianggap tidak ada", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "workflow-studio-token-"),
  );
  const tokenPath = path.join(directory, "server-token");

  try {
    fs.writeFileSync(tokenPath, "bukan-token-yang-sah");
    assert.equal(readServerToken(tokenPath), null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
