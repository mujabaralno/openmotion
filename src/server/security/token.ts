import fs from "node:fs";
import path from "node:path";

const DEFAULT_TOKEN_PATH = path.join(
  process.cwd(),
  "data",
  "runtime",
  "server-token",
);

export function getServerTokenPath(): string {
  const override = process.env.WORKFLOW_TOKEN_PATH;
  return override ? path.resolve(override) : DEFAULT_TOKEN_PATH;
}

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function writeServerToken(filePath = getServerTokenPath()): string {
  const token = generateToken();
  const directory = path.dirname(filePath);

  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, token, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
  fs.chmodSync(filePath, 0o600);

  return token;
}

export function readServerToken(filePath = getServerTokenPath()): string | null {
  try {
    const token = fs.readFileSync(filePath, "utf8").trim();
    return /^[a-f0-9]{64}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export function initializeServerToken(filePath = getServerTokenPath()): string {
  return writeServerToken(filePath);
}
