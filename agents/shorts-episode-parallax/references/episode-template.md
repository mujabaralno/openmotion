# Episode file template (2.5D parallax)

This template turns one topic into a file that the user pastes into Codex, prompt by prompt, and expects in the same structure every time. Fill every `<placeholder>`, keep the section order and headings, and delete this guidance block in the output.

## What the author must do (in this order)

1. **Read `series-log.md`** (last three rows). Fill "Variation vs previous episode" truthfully: palette family, character silhouette, hook formula, camera move and bold-moment type must all differ from those rows. When the file is done, add one row for this episode.
2. **Verify the facts with web search**, preferring institutional sources (museum, university, agency, journal, zoo). Give each claim a level: ESTABLISHED, WIDELY ACCEPTED, DEBATED or LEGEND, and word the narration to match the level (see the verbs below). If you have no web access, mark every claim `UNVERIFIED`, do not present anything as fact, and tell the user.
3. **Write the narration first**, in spoken Indonesian (rules below), then derive the scenes from it. The narration decides the timing.
4. **Replace adjectives with numbers.** "A big pull-back" becomes "zoom 2.4 to 1.0 over the scene"; "text appears" becomes "phrase from word 21 to 24, emphasis on word 22". The builder is a coding agent: it needs measurable instructions, not mood.
5. **Compute the anchors**: split the narration on whitespace and count. `ANCHORS` holds the index of the first word of each scene. Check the count twice.
6. **Deliver** the file plus a short chat summary: the arc in a few lines, the main accuracy choices, word count and estimated duration, the variation line, and the **self-check** (pass or fail for each item at the end of this guidance). The self-check stays in the chat, not in the file.

### Claim levels and verbs

| Level | Narration verbs |
|---|---|
| ESTABLISHED (multiple primary sources agree) | "adalah", "terjadi", "tercatat" |
| WIDELY ACCEPTED (consensus, some nuance) | "umumnya", "para ahli menilai" |
| DEBATED (experts disagree) | "ada yang berpendapat", "salah satu teori", name the camps; never pick a winner |
| LEGEND (story, not evidence) | "konon", "menurut cerita"; say clearly that it is a story |

### Voice-over rules (spoken Indonesian)

- Plan for about **2.5 spoken words per second, including pauses** (an assumption: measure the real audio of the first three episodes, then write the measured number in `series-log.md` and use it). State word count and estimated duration in the file.
- Short sentences, one idea per line, active voice, one concrete detail per sentence. Read it aloud once in your head: if you run out of breath, split it.
- Spoken register: plain and warm, not newsreader-stiff and not slang. Avoid stiff connectors such as "merupakan", "sebagaimana", "dalam rangka".
- **Remove AI-sounding patterns:** filler openers ("Tahukah kamu", "Pernahkah kamu membayangkan") unless it is truly the hook; "menariknya", "perlu diingat", "di era modern ini", "pada akhirnya", "fenomena menakjubkan"; the pattern "tidak hanya X, tetapi juga Y" more than once; lists of exactly three; em dashes; the same sentence frame for setup and takeaway; "bayangkan jika..." in every episode.
- Write numbers and years the way they are spoken ("seribu delapan ratus lima belas"); keep digits for on-screen text. Use "..." for a deliberate pause and blank lines between beats.
- No stage directions, scene labels or emojis inside the narration. Provider-specific tags (for example emotion tags) are optional and only used when the voice provider supports them; the Voicebox default is no tags.
- Vary the hook formula and the sentence rhythm between episodes (question, "semua orang tahu X, tapi...", a number, a what-if, a contradiction).

### Self-check (report in chat)

| Check | Pass |
|---|---|
| Narration is Indonesian, word count and duration stated, AI-pattern list applied | |
| Anchors counted and verified against the narration | |
| Every claim has a level and a source (or is marked UNVERIFIED) | |
| Narration compared line by line with the verified list; wording rules written | |
| Variation row filled and truly different from the last three episodes | |
| Every scene prompt has: depths, character action with timing, camera keyframes, kinetic phrases with word indices, SFX, transition, DONE WHEN, VERIFY | |
| One bold moment, named; every other scene calm | |
| Layer map and camera plan present; at most 8 layers and 3 blurred layers per scene | |
| Series log row added | |

---

````markdown
# <Series name> #<NN>: <Episode title as a question or claim>

## 1. Project Overview

- **Series:** <Series name>
- **Episode:** #<NN>   **Slug:** <slug>
- **Topic:** <One sentence: the question the episode answers, with the answer in brackets>
- **Format:** YouTube Shorts and TikTok, 9:16, 1080x1920, 30 fps
- **Visual Style:** <flat-parallax | comic> 2.5D parallax animation, layered scenery, simple cartoon characters, soft depth-of-field blur, warm light
- **Production:** Codex + Remotion for visuals, camera, timing, kinetic typography, SFX and polish. One continuous Indonesian voice-over file made outside the video.
- **Language:** Indonesian voice-over and Indonesian on-screen text. These prompts are in English.
- **Target Duration:** about <42-50> seconds (<N> seconds of narration plus a <4>-second silent end card)
- **Series constants:** same as earlier episodes (see style-bible.md section 1).
- **Variation vs previous episode:** <palette family, character silhouette and role, hook formula, primary camera move, bold-moment type. For #01: "First episode of the series; this sets the constants.">
- **Link to #<NN-1>:** <optional>

## 2. Core Message (accuracy note)

| # | Claim | Level | Source |
|---|---|---|---|
| 1 | <precise, checkable claim> | <ESTABLISHED / WIDELY ACCEPTED / DEBATED / LEGEND> | <source name and year> |
| 2 | <...> | | |

Simplified or invented (the video must not claim this is how it looks in reality): <character, setting, colors, diagrams, time compression>.

Wording rules:
- Do NOT say "<overclaim 1>": <one-line reason>.
- Do NOT say "<overclaim 2>": <one-line reason>.
- <topic-specific do-nots>

Key twist: **<the one line the viewer remembers>**

## Master Voice-over

Paste this into the voice tool unchanged. Approx. <N> words, about <X> seconds at <2.5> words per second.

```text
<scene 1 lines>

<scene 2 lines>

<...>
```

## 4. P0: Setup prompt (paste once, before any scene)

```text
TASK P0: set up episode <slug>. Do not build any scene yet.

1. Make sure these exist in the repo (create only what is missing, never overwrite): src/engine/ (camera, motion, kinetic, transitions, overlays, audio, timeline, fonts), scripts/make-assets.mjs, public/grain.png, public/sfx/*.wav. If sfx or grain are missing, run: node scripts/make-assets.mjs
2. Create src/episodes/<slug>/BRIEF.md with exactly the text between <<<BRIEF and BRIEF>>> below.
3. Check that public/audio/voiceover.mp3 and public/audio/voiceover.words.json exist. If they are missing, stop and tell me. Do not invent timestamps.
4. Create src/episodes/<slug>/episode.data.ts exporting: FPS = 30; SCRIPT (the narration below split on whitespace); WORDS = alignWords(SCRIPT, words from voiceover.words.json); ANCHORS = [<i0>, <i1>, ...]; TIMING = sceneFrames(WORDS, ANCHORS, FPS); TOTAL = TIMING.total; SFX = [] (scene prompts will fill it).
5. Create src/episodes/<slug>/Episode.tsx: <MasterAudio>, each scene in an overlapped <Sequence> (14 frames), then <Vignette/>, <Grain/>, <Watermark/>, and one <SfxCue> per entry of SFX. Scenes that are not built yet render a flat placeholder in the episode palette.
6. Register composition "Episode" in src/Root.tsx (1080x1920, 30 fps, durationInFrames = TOTAL).
7. Run the typecheck, then render one still at frame 0 and report what you see. Stop.

NARRATION (exact):
<the voice-over master text>

<<<BRIEF
# BRIEF: <Series name> #<NN> (<slug>)
Read this before touching any scene. A scene prompt may override this file for that scene only.

## Project facts

- Composition id "Episode", 1080x1920, 30 fps. Code lives in src/episodes/<slug>/. The engine in src/engine/ is shared: use it, do not rewrite it. Extend it only when a prompt says so.
- Voice-over: ONE file, public/audio/voiceover.mp3, with word timestamps in public/audio/voiceover.words.json. Never split or trim the audio per scene; it is placed once by <MasterAudio>. All timing comes from episode.data.ts (anchor words become frames). Never hardcode frame numbers for scene lengths or text timing.
- Language: on-screen text is Indonesian (the exact strings are in the prompts). Code and comments are English.
- The watermark "Mystery Lab" is rendered once in Episode.tsx on every frame, not per scene.
- Scene files: edit only src/episodes/<slug>/SceneNN.tsx, scenery or character files that the scene needs, and the SFX list in episode.data.ts.

## Standing requirements (apply to every scene)

1. Kinetic typography (educational). On-screen text is the narration made visible, not decoration.
   - Use <KineticLine> with words taken from WORDS (voice-over word timestamps), so each word appears exactly when it is spoken.
   - One phrase at a time, 2-6 words, at most 2 lines, centered, width at most 896 px. Key phrase 84-104 px, supporting text 64-72 px, footnotes 30-34 px. Nothing the viewer must read is below 56 px.
   - Emphasize 1-2 words per phrase (accent color, underline sweep, small overshoot): the word the voice stresses.
   - A phrase leaves about 20 frames after its last word (8-frame exit). Never two phrases on screen together. Never text over the character's face or the subject. Pick the upper band (y 192-600) or the lower-middle band (y 1000-1300) per scene and keep it for the whole scene.
   - Numbers and dates count up or tick into place. Labels attach to what they name (arrow or adjacency).
2. Smooth transitions. No hard cuts. Scenes overlap by 14 frames (<SceneShell>), so the outgoing scene is still moving while the new one arrives. Never use the same enter/exit pair twice in a row (fade, slide-up, slide-left). Carry one element across the cut when possible (a foreground leaf, a light ray, a shared color). A soft whoosh starts with every transition.
3. Alive animation. At every moment at least three things move: the camera, the character (idle bob 3-5 px at about 0.8 Hz plus a blink every 2-4 s) and one environment loop (plants sway +-2 degrees, clouds drift, water ripples, particles). Nothing holds perfectly still for more than 1 second. Give every instance its own phase so groups never move in sync. Entrances use springs (SPRINGS.pop for text and small items, SPRINGS.soft for panels); the camera uses ease-in-out.
4. Sound effects. Add them through <SfxCue> at the absolute frames listed in SFX in episode.data.ts: whoosh at each transition start (volume 0.20-0.28), pop or tick when a key phrase or the info card enters (0.15-0.25, once per phrase, never per word), a riser into the bold moment and a chime on the reveal (0.30), a chime on the end card. Voice-over stays at volume 1.0, music (optional) at 0.08-0.12 with a 20-frame fade-in and 45-frame fade-out. At most 6 SFX events in any 10 seconds. If public/sfx/ is empty, run node scripts/make-assets.mjs.
5. Component design (no AI slop). Every UI piece must be specific to this story: it uses the episode palette, a shape motif taken from the subject and wording taken from the narration. If the /top-design skill is installed, apply it. If not, follow section 11 of style-bible.md: no default purple-blue gradients, no emoji as icons, no identical white cards repeated for every fact, no centered stack of equal-width boxes, no system-default fonts.
6. Everything is drawn with code (SVG, CSS gradients, Remotion transforms). No photos, stock footage or generated images. No real people, no real logos or interfaces, no existing characters or mascots, no heavy outlines (flat variant), nothing scary or graphic. Mark simplified parts with a small footnote: "Ilustrasi disederhanakan."
7. Safe area. Everything that matters stays inside SAFE from src/engine/overlays.tsx (left 54, right 130, top 192, bottom 480 px). Backgrounds may bleed.
8. Performance. At most 8 layers per scene and 3 blurred layers at once. No full-screen SVG filters. Static far layers are blurred once and reused.

## Episode specifics

Visual style: <flat-parallax | comic>. Variation vs previous: <the variation line>.

Palette (this episode)
| Role | Hex | Used for |
|---|---|---|
| Sky | <#......> | <...> |
| Far scenery | <#......> | <...> |
| Mid scenery | <#......> | <...> |
| Subject accent | <#......> | <...> |
| Character outfit | <#......> | <...> |
| Ink (constant) | #2B3A42 | text and thin details |

Layer map
| Depth | Layer | Contents | Blur when out of focus |
|---|---|---|---|
| 0.00 | Sky | <...> | none |
| 0.15 | Far scenery | <...> | light |
| 0.30 | Mid scenery | <...> | light |
| 0.50 | Subject plane | <main character and subject> | in focus |
| 0.70 | Near props | <...> | medium |
| 0.90 | Foreground | <...> | heavy, partly cropped |

Camera plan (frames are scene-local; "end" means the last frame of the scene)
| Scene | Move | From to (zoom / x / y / focus) | Notes |
|---|---|---|---|
| 01 | <slow push-in> | <zoom 1.10 to 1.25, focus 0.5> | <...> |

Transitions plan: <scene 01 to 02: fade to slide-up; 02 to 03: ...>

Wording rules: <copy the wording rules from section 2 of the episode file>
BRIEF>>>
```

## 5. Scenes

Each scene prompt is self-contained about that scene and relies on BRIEF.md for the standing rules. The voice-over lines under each prompt are for reading only.

### SCENE 01: HOOK

**Planned time:** 0 to <5> s (real frames come from `TIMING`)   **Words:** <i0> to <i1>

**Purpose:** <what this scene does for the viewer>

```text
TASK: Implement Scene 01 ("<TITLE>") in src/episodes/<slug>/Scene01.tsx. Read src/episodes/<slug>/BRIEF.md and episode.data.ts first. Use TIMING.scenes[0] for the duration; do not hardcode frames.

VISUALS (back to front, depth in brackets):
- [0.00] <sky: gradient colors from the palette, sun position, clouds>
- [0.15] <far scenery, light blur>
- [0.30] <mid scenery, light blur>
- [0.50] <subject plane: the character (shape, outfit colors, size as a fraction of frame height), the subject, position as percentages of the frame>
- [0.70] <near props>
- [0.90] <foreground, heavy blur, partly cropped>
Focus starts at <depth> and moves to <depth> at <word or time>.

CHARACTER: <pose, what they hold or look at, when they blink or react, idle bob>.

CAMERA (scene-local frames): <frame 0: zoom 1.10, focus 0.50> to <frame end: zoom 1.25, focus 0.30>. Ease in-out.

TEXT (kinetic, Indonesian, words from WORDS):
- Phrase A: words <a> to <b> ("<exact text>"), emphasis on word <k>. Band: upper (y 192-600). Size <96> px.
- Phrase B: words <c> to <d> ("<exact text>"), emphasis on word <m>.

ENVIRONMENT LOOP: <reeds sway, water ripple, particles>.

SFX (add to SFX in episode.data.ts): <whoosh at TIMING.scenes[1].from - 14, volume 0.25>; <pop at the first word of phrase A, volume 0.2>.

TRANSITION OUT: <slide-up> over 14 frames.

DONE WHEN:
1. The first phrase appears on its first spoken word, +-3 frames.
2. At least three things move in every second of the scene.
3. No text or key shape outside SAFE; no text over the character's face.
4. The palette in BRIEF.md is used; no other colors.

VERIFY: render stills at scene-local frames 0, <mid>, <end> with: npx remotion still src/index.ts Episode out/s01-<frame>.png --frame=<absolute frame>. Open each still. Fix anything that breaks DONE WHEN, then stop. Report which checks passed.
```

**Voice-over**

> <lines>

### SCENE 02: <TITLE>

<Same structure. Typical arc: Hook, Setup, Mechanism or source, Detail, Bold moment, Cost or counterpoint, Takeaway, End card. Only the bold-moment scene may use sun rays, a riser and a chime, and a camera move larger than a 0.2 zoom change.>

### SCENE <LAST>: END CARD

**Planned time:** <the last <4> seconds>

```text
TASK: Implement the end card in src/episodes/<slug>/EndCard.tsx. Read BRIEF.md first. Duration is TIMING.endCard.duration.

VISUALS: warm sunburst gradient from <center color> to <edge color>, subtle grain. Center: the twist line "<exact text>" at 96-104 px, rounded bold, max 3 lines, width at most 896 px, appearing word by word (spring pop, 4 frames apart). Below: a small flat illustration of <key subject>, gentle bob. Bottom (inside SAFE): "<Series name> #<NN>" and "Ikuti untuk #<NN+1>" at 34 px. Very slow pull-back (zoom 1.15 to 1.0) and slow-rotating soft rays behind the text.

SFX: chime at the first frame of the end card, volume 0.3. No voice-over.

DONE WHEN: the twist line is fully visible for at least 1.5 seconds, inside SAFE, and the watermark is still visible.

VERIFY: render stills at the first frame, 1.5 s in and the last frame. Fix and stop.
```

## 6. PF: Final assembly and QA prompt (paste after all scenes are built)

```text
TASK PF: assemble and check episode <slug>. Read src/episodes/<slug>/BRIEF.md first.

1. In Episode.tsx make sure: one <MasterAudio> for the whole episode; scenes overlap by 14 frames; each transition has a whoosh cue in SFX; <Watermark/>, <Vignette/>, <Grain/> are on top of all scenes.
2. Render stills at: frame 0, the middle of every transition, the emphasized word of every phrase, and the last frame. Add <SafeAreaDebug/> temporarily. Look at every still.
3. Check and fix: (a) no text or key shape outside SAFE, (b) no text over a face or subject, (c) no two phrases on screen together, (d) the watermark is visible in every still, (e) at least three things move in every scene (compare two stills 20 frames apart), (f) the total duration equals voiceover length + 0.5 s + end card, (g) no enter/exit pair repeats twice in a row, (h) no more than 6 SFX events in any 10 seconds.
4. Remove <SafeAreaDebug/>. Render: npx remotion render src/index.ts Episode out/<slug>.mp4 --codec h264
5. Report: a table of checks (a)-(h) with pass or fail, final duration, file size, and anything you changed.
```

## 7. Recommended final structure

```text
SCENE 01: <NAME>   0:00-0:05   "<key line>"
        |
SCENE 02: <NAME>   ...
        |
END CARD           <last 4 s>  "<twist line>"
```

## 8. Series log row (append to series-log.md)

`| <NN> | <slug> | <palette family> | <character: silhouette, role> | <hook formula> | <primary camera move> | <bold-moment type> | <twist line> | <measured words per second, after audio exists> |`
````