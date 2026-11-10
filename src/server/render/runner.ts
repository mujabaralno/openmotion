import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { redactText } from '../security/redact.ts';

export type WorkerResult = { duration?: number };
export function runRenderWorker(mode: 'probe' | 'preview' | 'render', input: string, output: string, signal: AbortSignal, onProgress?: (progress: number, phase: string) => void): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Pekerjaan dibatalkan.')); return; }
    // Do not pass API keys or the app's security token into rendering code.
    const allowedEnvironment = new Set(['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'SystemRoot', 'WINDIR']);
    const env: NodeJS.ProcessEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => allowedEnvironment.has(key))), NODE_ENV: 'production' };
    const child = spawn(process.execPath, [path.join(process.cwd(), 'scripts', 'render-episode.mjs'), mode, input, output], { cwd: process.cwd(), env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = ''; let message = ''; let duration: number | undefined;
    const kill = () => { if (!child.pid) return; try { if (process.platform === 'win32') child.kill('SIGKILL'); else process.kill(-child.pid, 'SIGKILL'); } catch { /* process already exited */ } };
    const timeout = setTimeout(() => { message = 'Pekerjaan render melewati batas dua jam.'; kill(); }, 2 * 60 * 60 * 1000);
    const onExit = () => kill();
    process.once('exit', onExit);
    signal.addEventListener('abort', kill, { once: true });
    child.stdout.on('data', chunk => {
      buffer += String(chunk);
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        try {
          const event = JSON.parse(line);
          if (event.type === 'progress') onProgress?.(Math.max(0, Math.min(1, event.progress)), event.phase);
          if (event.type === 'metadata') duration = event.duration;
          if (event.type === 'error') message = redactText(String(event.error));
        } catch { /* non-protocol build output */ }
      }
    });
    child.stderr.on('data', chunk => { message = redactText(String(chunk).slice(-3000)); });
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', kill);
      process.removeListener('exit', onExit);
      kill();
      if (mode !== 'probe' && output) {
        try { fs.rmSync(path.join(path.dirname(output), `.bundle-${path.basename(output)}`), { recursive: true, force: true }); }
        catch { /* optional generated bundle cleanup */ }
      }
    };
    child.once('error', error => { cleanup(); reject(new Error(`Gagal memulai renderer: ${redactText(error.message)}`)); });
    child.once('close', code => { cleanup(); if (signal.aborted) reject(new Error('Pekerjaan dibatalkan.')); else if (code !== 0) reject(new Error(message || 'Renderer gagal. Pastikan dependensi remotion sudah diinstal.')); else resolve({ duration }); });
  });
}
