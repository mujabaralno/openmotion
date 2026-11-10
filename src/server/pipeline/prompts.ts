import fs from 'node:fs';
import path from 'node:path';
import { resolveWorkspaceDir } from '../workspace/init.ts';
import { getSettings } from './settings.ts';
import { artifactPath, writeArtifact } from './files.ts';
import { getEpisodeBySlug, listEpisodes } from '../episodes/repository.ts';
import type { StepKind } from '../db/index.ts';

function managedPath(root: string, relative: string): string {
  let current = root;
  for (const part of relative.split('/')) {
    if (!part || part === '..' || part === '.') throw new Error('Lokasi instruksi tidak valid.');
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Folder instruksi tidak boleh berupa symlink.');
  }
  return current;
}
export function seedProductionFiles(): void {
  const root = resolveWorkspaceDir();
  const copyMissing = (source: string, relative: string) => {
    const target = managedPath(root, relative);
    if (fs.existsSync(target)) { if (!fs.statSync(target).isFile()) throw new Error(`Diharapkan file: ${relative}`); return; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    managedPath(root, relative);
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  };
  const skillSource = path.join(process.cwd(), 'agents', 'shorts-episode-parallax');
  copyMissing(path.join(skillSource, 'SKILL.md'), 'agents/shorts-episode-parallax/SKILL.md');
  for (const name of fs.readdirSync(path.join(skillSource, 'references'))) {
    if (!/^[a-z0-9.-]+\.md$/.test(name)) continue;
    copyMissing(path.join(skillSource, 'references', name), `agents/shorts-episode-parallax/references/${name}`);
  }
  for (const name of ['script', 'tags', 'scenes']) copyMissing(path.join(process.cwd(), 'agents', 'prompts', `${name}.md`), `prompts/${name}.md`);
  copyMissing(path.join(skillSource, 'references', 'style-bible.md'), 'guide/style-parallax.md');
}
export function buildStepPrompt(slug: string, kind: StepKind, notes: string): string {
  seedProductionFiles();
  const episode = getEpisodeBySlug(slug);
  if (!episode) throw new Error('Episode tidak ditemukan.');
  const settings = getSettings();
  const root = resolveWorkspaceDir();
  const skill = path.join(root, 'agents', 'shorts-episode-parallax', 'SKILL.md');
  const previous = listEpisodes().filter(item => item.id < episode.id && item.steps.find(step => step.kind === 'script')?.status === 'approved').sort((a,b) => b.id - a.id)[0];
  const vars: Record<string, string> = {
    topic: episode.topic || episode.title, title: episode.title, series: settings.series, number: String(episode.id).padStart(2, '0'),
    guide: path.join(root, 'guide', 'style-parallax.md'), language: settings.language, captionsLanguage: settings.captionsLanguage, modelId: settings.modelId, skill,
    previous: previous ? artifactPath(previous.slug, '01-episode.md') : 'No previous approved episode. Establish the series constants.',
    package: artifactPath(slug, '01-episode.md'), narration: artifactPath(slug, '01-naskah.md'), tagged: artifactPath(slug, '02-naskah-tagged.md'),
    audioMetadata: artifactPath(slug, '03-audio.json'), composition: artifactPath(slug, 'Episode.tsx', 'composition'), notes: notes ? `Revision notes from the creator:\n${notes}` : '',
  };
  writeArtifact(slug, 'AGENTS.md', `# Episode workspace\n\nFollow the skill at ${skill}. Read its referenced documents as needed.\n\nOutput contract: stage script writes 01-episode.md with a fenced text block under the exact heading ## Master Voice-over. The app extracts 01-naskah.md. Stage tags writes only 02-naskah-tagged.md. Stage scenes writes only remotion/Episode.tsx with a default export. Do not edit app-owned metadata, other episodes, credentials, or configuration. Audio and rendering are handled by the application.\n`);
  const template = fs.readFileSync(managedPath(root, `prompts/${kind}.md`), 'utf8');
  return template.replace(/\{\{([a-zA-Z_]+)\}\}/g, (_, key: string) => { if (!(key in vars)) throw new Error(`Variabel template belum tersedia: ${key}`); return vars[key]; });
}
