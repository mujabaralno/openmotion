import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveWorkspaceDir } from '../workspace/init.ts';
import { resolveWorkspacePath, type WorkspaceArea } from '../workspace/paths.ts';

export function artifactPath(slug: string, fileName: string, area: WorkspaceArea = 'episode'): string {
  const result = resolveWorkspacePath({ workspaceRoot: resolveWorkspaceDir(), episodeSlug: slug, area, fileName });
  if (!result.ok) throw new Error(`Lokasi file ditolak: ${fileName} (${result.reason}).`);
  return result.path;
}
export function writeArtifact(slug: string, fileName: string, content: string | Buffer, area: WorkspaceArea = 'episode'): void {
  const target = artifactPath(slug, fileName, area);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Re-resolve after creating parents and before committing the file.
  artifactPath(slug, fileName, area);
  const temporary = path.join(path.dirname(target), `.write-${randomUUID()}`);
  try {
    fs.writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
    artifactPath(slug, fileName, area);
    fs.renameSync(temporary, target);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function readArtifact(slug: string, fileName: string): string {
  const target = artifactPath(slug, fileName);
  if (!fs.existsSync(target)) throw new Error(`File ${fileName} belum tersedia.`);
  if (fs.statSync(target).size > 2_000_000) throw new Error('File teks terlalu besar.');
  return fs.readFileSync(target, 'utf8');
}
export function hasArtifact(slug: string, fileName: string, area: WorkspaceArea = 'episode'): boolean {
  const target = artifactPath(slug, fileName, area);
  return fs.existsSync(target) && fs.statSync(target).size > 0;
}
