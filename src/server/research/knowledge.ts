import fs from 'node:fs';
import { getDb } from '../db/index.ts';
import { redactText } from '../security/redact.ts';
import { artifactPath } from '../pipeline/files.ts';
import { youtubeStatus } from '../youtube/client.ts';

export type ResearchSource = { label: string; id: string; title: string; href: string; kind: 'episode' | 'youtube'; excerpt: string };
type Document = { source_id: string; title: string; content: string; href: string; kind: ResearchSource['kind'] };
function chunks(text: string) {
  const result: string[] = [];
  for (let at = 0; at < Math.min(text.length, 30000); at += 1300) result.push(text.slice(at, at + 1500));
  return result;
}
export function rebuildKnowledge() {
  const db = getDb(); const documents: Document[] = [];
  const episodes = db.prepare(`SELECT e.id,e.slug,e.title,e.topic,
    EXISTS(SELECT 1 FROM steps WHERE episode_id=e.id AND kind='render' AND status='approved') AS rendered,
    EXISTS(SELECT 1 FROM steps WHERE episode_id=e.id AND kind='publish' AND status='approved') AS published
    FROM episodes e WHERE EXISTS(SELECT 1 FROM steps WHERE episode_id=e.id AND kind='script' AND status='approved') ORDER BY e.id DESC LIMIT 500`).all() as {id:number;slug:string;title:string;topic:string;rendered:number;published:number}[];
  for (const episode of episodes) {
    const prefix = `Topik: ${episode.topic}. Status: ${episode.rendered ? 'video final disetujui' : 'naskah disetujui, video belum final'}.`;
    const texts = [prefix];
    for (const name of ['01-naskah.md', '01-episode.md', ...(episode.published ? ['06-publish.md'] : [])]) {
      try {
        const file = artifactPath(episode.slug, name);
        if (fs.existsSync(file) && fs.statSync(file).size <= 2_000_000) texts.push(fs.readFileSync(file, 'utf8').slice(0, 30000));
      } catch { /* An unsafe or absent artifact is not a research source. */ }
    }
    chunks(texts.join('\n\n')).forEach((content, i) => documents.push({ source_id: `episode:${episode.slug}:${i}`, title: episode.title, content, href: `/episodes/${episode.slug}`, kind: 'episode' }));
  }
  const youtube = youtubeStatus();
  for (const video of youtube.videos) documents.push({ source_id: `youtube:${video.id}`, title: video.title, href: `https://www.youtube.com/watch?v=${video.id}`, kind: 'youtube', content: `${video.description.slice(0, 2000)}\nPublished: ${video.published_at}\nRequested reporting period: ${youtube.periodStart} to ${youtube.periodEnd}; synced: ${youtube.syncedAt}.\nViews in period: ${video.views}; watch minutes: ${video.watch_minutes}; average percentage viewed: ${video.average_percentage}%; likes: ${video.likes}; comments: ${video.comments}; subscribers gained: ${video.subscribers_gained}. These are period metrics, not lifetime totals. Analytics may lag.` });
  db.transaction(() => {
    db.prepare('DELETE FROM research_knowledge').run();
    const insert = db.prepare('INSERT INTO research_knowledge (source_id,title,content,href,kind) VALUES (?,?,?,?,?)');
    for (const item of documents) insert.run(item.source_id, redactText(item.title), redactText(item.content), item.href, item.kind);
  })();
  return { episodes: episodes.length, videos: youtube.videos.length, chunks: documents.length };
}
export function retrieveKnowledge(question: string): ResearchSource[] {
  rebuildKnowledge();
  const terms = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, 24);
  const query = terms.map(term => `"${term}"`).join(' OR ');
  const db = getDb();
  const matches = query ? db.prepare('SELECT source_id,title,content,href,kind FROM research_knowledge WHERE research_knowledge MATCH ? ORDER BY bm25(research_knowledge,0,5,1,0,0) LIMIT 18').all(query) as Document[] : [];
  // Also expose top performers for broad requests such as "carikan ide berikutnya".
  const top = db.prepare("SELECT source_id,title,content,href,kind FROM research_knowledge WHERE kind='youtube' ORDER BY rowid LIMIT 3").all() as Document[];
  const fallback = db.prepare("SELECT source_id,title,content,href,kind FROM research_knowledge WHERE kind='episode' ORDER BY rowid LIMIT 3").all() as Document[];
  const selected: Document[] = [];
  for (const item of [...matches.slice(0, 5), ...top, ...matches.slice(5), ...fallback]) {
    if (selected.filter(other => other.href === item.href).length >= 2 || selected.some(other => other.source_id === item.source_id)) continue;
    selected.push(item); if (selected.length === 8) break;
  }
  return selected.map((item, index) => ({ label: `S${index + 1}`, id: item.source_id, title: item.title, href: item.href, kind: item.kind, excerpt: item.content }));
}
