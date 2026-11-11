import fs from 'node:fs';
import { SFX_FILES, synthesizeSfx } from './sfx.ts';
import { artifactPath, readArtifact, writeArtifact } from './files.ts';
import { getEpisodeBySlug } from '../episodes/repository.ts';
import { resolveWorkspacePath } from '../workspace/paths.ts';
import { resolveWorkspaceDir } from '../workspace/init.ts';

type Word = { text: string; start: number; end: number };
export function prepareComposition(slug: string): { duration: number; captionsEstimated: boolean } {
  // Preserve any existing source from the old layout. Never delete or replace
  // the creator's original episode files, or overwrite a newer project source.
  const source = artifactPath(slug, 'Episode.tsx', 'composition');
  if (!fs.existsSync(source)) {
    const legacy = resolveWorkspacePath({ workspaceRoot: resolveWorkspaceDir(), episodeSlug: slug, area: 'composition', fileName: 'Episode.tsx' });
    if (!legacy.ok) throw new Error(`Komposisi lama tidak aman (${legacy.reason}).`);
    if (fs.existsSync(legacy.path)) writeArtifact(slug, 'Episode.tsx', fs.readFileSync(legacy.path), 'composition');
  }
  const metadata = JSON.parse(readArtifact(slug, '03-audio.json')) as { duration: number };
  if (!Number.isFinite(metadata.duration) || metadata.duration <= 0 || metadata.duration > 600) throw new Error('Durasi audio tidak valid.');
  const timing = JSON.parse(readArtifact(slug, '03-voiceover.timestamps.json')) as { alignment?: { characters?: string[]; character_start_times_seconds?: number[]; character_end_times_seconds?: number[] } };
  const words: Word[] = []; const alignment = timing.alignment;
  let word = ''; let start = 0; let end = 0; let inTag = false;
  if (alignment?.characters && alignment.character_start_times_seconds && alignment.character_end_times_seconds) {
    for (let i = 0; i < alignment.characters.length; i++) {
      const char = alignment.characters[i];
      if (char === '[') inTag = true;
      if (!inTag) {
        if (/\s/.test(char)) { if (word) words.push({ text: word, start, end }); word = ''; }
        else {
          if (!word) start = alignment.character_start_times_seconds[i];
          word += char; end = alignment.character_end_times_seconds[i];
        }
      }
      if (char === ']') inTag = false;
    }
    if (word) words.push({ text: word, start, end });
  }
  const estimated = words.length === 0;
  if (estimated) {
    const tokens = readArtifact(slug, '01-naskah.md').trim().split(/\s+/);
    tokens.forEach((text, i) => words.push({ text, start: i / tokens.length * metadata.duration, end: (i + 1) / tokens.length * metadata.duration }));
  }
  const sfx = Object.fromEntries(Object.entries(SFX_FILES).map(([kind, name]) => {
    writeArtifact(slug, name, synthesizeSfx(kind as keyof typeof SFX_FILES), 'composition-public');
    return [kind, `episodes/${slug}/${name}`];
  }));
  const props = { sfx, durationInFrames: Math.ceil((metadata.duration + 3) * 30), fps: 30, audioDuration: metadata.duration, title: getEpisodeBySlug(slug)!.title, words };
  writeArtifact(slug, 'audio.mp3', fs.readFileSync(artifactPath(slug, '03-voiceover.mp3')), 'composition-public');
  writeArtifact(slug, 'timestamps.json', JSON.stringify(timing), 'composition-public');
  writeArtifact(slug, 'props.json', JSON.stringify(props, null, 2), 'composition');
  if (fs.existsSync(source)) writeArtifact(slug, 'index.tsx', `import React from 'react';
import {registerRoot, Composition, AbsoluteFill, Audio, staticFile, useCurrentFrame} from 'remotion';
import Episode from './Episode';
import props from './props.json';
const EpisodeVisual: React.ComponentType<typeof props> = Episode;
function Captions(){
 const time = useCurrentFrame()/props.fps;
 const active = props.words.findIndex(w=>time>=w.start && time<w.end);
 if(active<0 || time>=props.audioDuration) return null;
 const first=Math.floor(active/5)*5;
 return <div style={{position:'absolute',left:76,right:76,bottom:190,textAlign:'center',fontFamily:'Arial, sans-serif',fontWeight:700,fontSize:48,lineHeight:1.25,color:'#f5f7ff',textShadow:'0 2px 12px rgba(0,0,0,.65)',pointerEvents:'none'}}>{props.words.slice(first,first+5).map((w,i)=><span key={first+i} style={{color:first+i===active?'#ffe68a':'#f5f7ff',marginRight:10}}>{w.text}</span>)}</div>;
}
function Video(){return <AbsoluteFill><EpisodeVisual {...props}/><Audio src={staticFile(${JSON.stringify(`episodes/${slug}/audio.mp3`)})}/><Captions/><div style={{position:'absolute',top:96,right:76,fontFamily:'Arial, sans-serif',fontSize:26,fontWeight:600,letterSpacing:1,color:'rgba(255,255,255,.72)',textShadow:'0 1px 6px rgba(0,0,0,.6)',pointerEvents:'none'}}>Mystery Lab</div></AbsoluteFill>}
function Root(){return <Composition id="Episode" component={Video} durationInFrames={props.durationInFrames} fps={30} width={1080} height={1920}/>}
registerRoot(Root);
`, 'composition');
  return { duration: metadata.duration + 3, captionsEstimated: estimated };
}
