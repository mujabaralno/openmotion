# Example episode file: Everyday Why #01, flamingo

This is the reference for the structure, the level of detail and the quality bar. **Copy the structure and the level of detail, not the character, palette, setting, hook or sentences.** Series name and topic here are only an illustration. The facts were checked when v1 of this example was written; re-verify them before reusing any of them.

---

# Everyday Why #01: Why Is Every Flamingo Born Gray?

## 1. Project Overview

- **Series:** Everyday Why
- **Episode:** #01   **Slug:** flamingo
- **Topic:** Why are flamingos pink? [They are not born pink; the color comes from pigments in food, passed to chicks in a red "milk".]
- **Format:** YouTube Shorts and TikTok, 9:16, 1080x1920, 30 fps
- **Visual Style:** flat-parallax 2.5D animation, layered scenery, simple cartoon characters, soft depth-of-field blur, warm light
- **Production:** Codex + Remotion for visuals, camera, timing, kinetic typography, SFX and polish. One continuous Indonesian voice-over file made outside the video.
- **Language:** Indonesian voice-over and Indonesian on-screen text. These prompts are in English.
- **Target Duration:** about 46 seconds (104 words of narration, about 42 seconds at 2.5 words per second, plus 0.5 s tail and a 4-second silent end card)
- **Series constants:** this episode sets them (see style-bible.md section 1).
- **Variation vs previous episode:** first episode of the series; this sets the constants.

## 2. Core Message (accuracy note)

| # | Claim | Level | Source |
|---|---|---|---|
| 1 | Flamingo chicks hatch with gray or whitish down | ESTABLISHED | Smithsonian's National Zoo |
| 2 | The pink-orange color comes from carotenoid pigments in their food (algae and small crustaceans such as brine shrimp) | ESTABLISHED | Smithsonian's National Zoo; Discover Wildlife |
| 3 | Both parents feed the chick a red "crop milk" made in the upper digestive tract; it carries pigments | ESTABLISHED | Los Angeles Zoo; Discover Wildlife |
| 4 | The chick becomes fully pink over a few years, as new feathers grow | WIDELY ACCEPTED | Smithsonian's National Zoo; EarthSky |
| 5 | Raising chicks can leave parents paler | WIDELY ACCEPTED | zoo and wildlife sources above |
| 6 | Flamingos in zoos are given carotenoid-rich food to keep their color | ESTABLISHED | Smithsonian's National Zoo |

Simplified or invented: the ranger character, the lagoon, all colors, the time-lapse, the diagrams. The video must not claim this is exactly how it looks in reality ("Ilustrasi disederhanakan").

Wording rules:
- Do NOT say flamingos are "born pink" or that they "turn pink by drinking blood". The red "milk" is not blood and not mammal milk.
- Do NOT say all parents lose their color; only that it can happen.
- Do NOT give exact ages beyond "beberapa tahun".
- Never show or name a real product, logo or interface. Never copy an existing cartoon character.

Key twist: **Lahir abu-abu. Diberi makan pink.**

## Master Voice-over

Paste this into the voice tool unchanged. 104 words, about 42 seconds at 2.5 words per second.

```text
Semua flamingo lahir berwarna abu-abu...
Lalu dari mana warna pink itu datang?

Anak flamingo yang baru menetas berbulu halus, abu-abu keputihan.
Pink bukan bawaan lahir... itu harus ditumbuhkan.

Warnanya datang dari makanan.
Flamingo menyaring alga dan udang kecil... yang penuh pigmen alami bernama karotenoid.

Tubuhnya mengolah pigmen itu... lalu menyimpannya di bulu-bulu baru yang sedang tumbuh.

Tapi anak flamingo belum bisa menyaring makanan sendiri.
Jadi kedua induknya membuat "susu" merah terang di tenggorokan mereka... dan susu itu membawa pigmen yang sama.

Dan itu ada harganya...
Membesarkan anak bisa membuat bulu induknya jadi lebih pucat.

Jadi flamingo tidak lahir pink... mereka diberi makan jadi pink.
```

## 4. P0: Setup prompt (paste once, before any scene)

```text
TASK P0: set up episode flamingo. Do not build any scene yet.

1. Make sure these exist in the repo (create only what is missing, never overwrite): src/engine/ (camera, motion, kinetic, transitions, overlays, audio, timeline, fonts), scripts/make-assets.mjs, public/grain.png, public/sfx/*.wav. If sfx or grain are missing, run: node scripts/make-assets.mjs
2. Create src/episodes/flamingo/BRIEF.md with exactly the text between <<<BRIEF and BRIEF>>> below.
3. Check that public/audio/voiceover.mp3 and public/audio/voiceover.words.json exist. If they are missing, stop and tell me. Do not invent timestamps.
4. Create src/episodes/flamingo/episode.data.ts exporting: FPS = 30; SCRIPT (the narration below split on whitespace, 104 words); WORDS = alignWords(SCRIPT, words from voiceover.words.json); ANCHORS = [0, 12, 28, 44, 56, 81, 94]; TIMING = sceneFrames(WORDS, ANCHORS, FPS); TOTAL = TIMING.total; SFX = [] (scene prompts will fill it).
5. Create src/episodes/flamingo/Episode.tsx: <MasterAudio>, each scene in an overlapped <Sequence> (14 frames), then <Vignette/>, <Grain/>, <Watermark/>, and one <SfxCue> per entry of SFX. Scenes that are not built yet render a flat placeholder in the episode palette.
6. Register composition "Episode" in src/Root.tsx (1080x1920, 30 fps, durationInFrames = TOTAL).
7. Run the typecheck, then render one still at frame 0 and report what you see. Stop.

NARRATION (exact):
Semua flamingo lahir berwarna abu-abu...
Lalu dari mana warna pink itu datang?

Anak flamingo yang baru menetas berbulu halus, abu-abu keputihan.
Pink bukan bawaan lahir... itu harus ditumbuhkan.

Warnanya datang dari makanan.
Flamingo menyaring alga dan udang kecil... yang penuh pigmen alami bernama karotenoid.

Tubuhnya mengolah pigmen itu... lalu menyimpannya di bulu-bulu baru yang sedang tumbuh.

Tapi anak flamingo belum bisa menyaring makanan sendiri.
Jadi kedua induknya membuat "susu" merah terang di tenggorokan mereka... dan susu itu membawa pigmen yang sama.

Dan itu ada harganya...
Membesarkan anak bisa membuat bulu induknya jadi lebih pucat.

Jadi flamingo tidak lahir pink... mereka diberi makan jadi pink.

<<<BRIEF
# BRIEF: Everyday Why #01 (flamingo)
Read this before touching any scene. A scene prompt may override this file for that scene only.

## Project facts

- Composition id "Episode", 1080x1920, 30 fps. Code lives in src/episodes/flamingo/. The engine in src/engine/ is shared: use it, do not rewrite it. Extend it only when a prompt says so.
- Voice-over: ONE file, public/audio/voiceover.mp3, with word timestamps in public/audio/voiceover.words.json. Never split or trim the audio per scene; it is placed once by <MasterAudio>. All timing comes from episode.data.ts (anchor words become frames). Never hardcode frame numbers for scene lengths or text timing.
- Language: on-screen text is Indonesian (the exact strings are in the prompts). Code and comments are English.
- The watermark "Mystery Lab" is rendered once in Episode.tsx on every frame, not per scene.
- Scene files: edit only src/episodes/flamingo/SceneNN.tsx, scenery or character files that the scene needs, and the SFX list in episode.data.ts.

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

Visual style: flat-parallax. Variation vs previous: first episode of the series; this sets the constants.

Palette (this episode: lagoon sunrise)
| Role | Hex | Used for |
|---|---|---|
| Sky top / horizon | #FBE3C8 / #CFEFE3 | sky gradient, sun glow |
| Far scenery | #BFD8D2 | hills, distant haze |
| Mid scenery | #7FC6BE | lagoon water, shore |
| Subject accent | #F58AA0 (deep #E4577A, pale #F9C4CF) | pink flamingos, carotenoid dots, accents |
| Chick gray | #CBD0D8 | chick, unpigmented feathers |
| Character outfit | #5E7F6B (hat #F2C14E, skin #F6D2B0) | the ranger |
| Ink (constant) | #2B3A42 | text and thin details |

Layer map
| Depth | Layer | Contents | Blur when out of focus |
|---|---|---|---|
| 0.00 | Sky | gradient, low sun, two drifting clouds | none |
| 0.15 | Far scenery | hills, far flock of tiny pink dots | light (6 px) |
| 0.30 | Mid scenery | lagoon, shoreline, nest mound | light (4 px) |
| 0.50 | Subject plane | ranger, chick, parent flamingos, diagrams | in focus |
| 0.70 | Near props | reed clusters, a small sign post | medium (8 px) |
| 0.90 | Foreground | two big reed blades, cropped | heavy (12 px) |

Camera plan (scene-local; "end" is the last frame of the scene)
| Scene | Move | From to | Notes |
|---|---|---|---|
| 01 | push-in | zoom 1.10 to 1.30, y 0 to -60, focus 0.5 | slow, eased |
| 02 | lateral drift | zoom 1.30 to 1.45, x 0 to 100, focus 0.5 | continues the push, slides to the chick |
| 03 | push-in into the water cutaway | zoom 1.10 to 1.35, y 0 to 80, focus 0.5 | background blurred |
| 04 | almost still | zoom 1.0 to 1.06, focus 0.5 | the diagram is the movement |
| 05 | pull-back reveal (signature) | zoom 2.4 to 1.0, y 120 to 0, focus 0.5 | starts at word 67, 150 frames |
| 06 | lateral drift | zoom 1.15, x 0 to 140, focus 0.5 | the colour change happens during the drift |
| 07 | tilt-up reveal | zoom 1.0 to 1.10, y 0 to -300, focus 0.5 to 0.3 | foreground reeds slide past |

Transitions plan (exit of the scene, enter of the next): 01 to 02 fade, fade; 02 to 03 fade, slide-up; 03 to 04 slide-up, slide-left; 04 to 05 slide-left, fade; 05 to 06 fade, slide-left; 06 to 07 slide-left, slide-up; 07 to end card fade, fade.

Wording rules: do not say flamingos are "born pink" or that they "turn pink by drinking blood"; the red "milk" is not blood and not mammal milk; do not say all parents lose their color, only that it "can" happen; do not give exact ages beyond "beberapa tahun".
BRIEF>>>
```

## 5. Scenes

Each scene prompt is self-contained about that scene and relies on BRIEF.md for the standing rules. The voice-over lines under each prompt are for reading only.

### SCENE 01: HOOK

**Planned time:** 0 to 4.8 s   **Words:** 0 to 11

**Purpose:** Plant the question: the viewer sees a gray chick and wants the answer.

```text
TASK: Implement Scene 01 ("Hook") in src/episodes/flamingo/Scene01.tsx. Read src/episodes/flamingo/BRIEF.md and episode.data.ts first. Use TIMING.scenes[0] for the duration; do not hardcode frames.

VISUALS (back to front, depth in brackets):
- [0.00] sky gradient #FBE3C8 (top) to #CFEFE3 (horizon at 55% of frame height); low sun disc #FFD58A, radius 90 px at x 70%, y 40%; two soft clouds drifting 12 px per second.
- [0.15] far hills #BFD8D2, a band between y 45% and 58%, blur 6 px.
- [0.30] lagoon #7FC6BE between y 58% and 80% with thin ripple lines moving slowly; blur 4 px.
- [0.50] subject plane: the ranger (about 38% of frame height) at x 30% standing on the shore (y 72% to 80%), notebook in hand; behind him on a mud mound at x 66%, y 70%, a single fuzzy gray chick #CBD0D8 about 9% of frame height.
- [0.70] three reed clusters at the right edge, swaying +-2 degrees at 0.3 Hz, each with its own phase; blur 8 px.
- [0.90] two big reed blades in the bottom corners, cropped, blur 12 px.
Focus stays at 0.5.

CHARACTER: ranger idle bob 4 px at 0.8 Hz, blink every 3 s; on word 5 he raises the notebook and points at the chick (arm rotation 8 to -55 degrees over 12 frames).

CAMERA (scene-local): frame 0 zoom 1.10, y 0; last frame zoom 1.30, y -60; focus 0.5. Ease in-out.

TEXT (kinetic, Indonesian, from WORDS, upper band y 192-600, 96 px):
- Phrase A: words 0 to 4 ("Semua flamingo lahir berwarna abu-abu"), emphasis on word 4 (abu-abu), holdFrames 4 so it is gone when B starts.
- Phrase B: words 6 to 11 ("dari mana warna pink itu datang?"), emphasis on word 9 (pink) in #E4577A.

SFX (append to SFX in episode.data.ts): pop at the first word of phrase A, volume 0.2; whoosh at TIMING.scenes[1].from - 14, volume 0.25.

ENTER: fade (first scene: start fully visible, no enter). EXIT: fade, 14 frames.

DONE WHEN:
1. Phrase A appears on its first spoken word, +-3 frames; phrase B on word 6; they never overlap.
2. At least three things move in every second (camera, ranger idle, reeds or clouds).
3. No text or key shape outside SAFE; no text over the ranger's face.
4. Only the palette in BRIEF.md is used.

VERIFY: render stills at scene-local frames 0, 60, last with: npx remotion still src/index.ts Episode out/s01-<frame>.png --frame=<absolute frame>. Open each still. Fix anything that breaks DONE WHEN, then stop and report which checks passed.
```

**Voice-over**

> Semua flamingo lahir berwarna abu-abu...
> Lalu dari mana warna pink itu datang?

### SCENE 02: SETUP

**Planned time:** 4.8 to 11.2 s   **Words:** 12 to 27

**Purpose:** Show that color is not innate.

```text
TASK: Implement Scene 02 ("Setup") in src/episodes/flamingo/Scene02.tsx. Read BRIEF.md and episode.data.ts first. Use TIMING.scenes[1]; do not hardcode frames.

VISUALS (back to front):
- [0.00] same sky as Scene 01, sun slightly higher (y 36%).
- [0.15] far hills, a few tiny pink dots (a far flock) at y 50%, blur 6 px.
- [0.30] the lagoon edge and a mud nest mound filling the lower middle, blur 4 px.
- [0.50] subject plane: the gray chick, now large (about 22% of frame height) at x 60%, y 62%, sitting on the nest mound, fluffy down drawn as 3 overlapping soft ellipses #CBD0D8 and #E3E6EB; the ranger at the left edge (x 14%), crouched, writing in the notebook.
- [0.70] reeds at the right edge; [0.90] one big blurred reed blade at the bottom-left.

CHARACTER: chick bobs 3 px at 0.9 Hz and blinks; its head tilts 6 degrees at word 21. Ranger's pen hand moves in a small 6 px loop at 3 Hz while writing; nods once on word 21.

CAMERA: lateral drift, frame 0 zoom 1.30, x 0; last frame zoom 1.45, x 100; focus 0.5.

INFO CARD (lower-middle band, y 1000-1300, enters from the right with SPRINGS.soft at the first spoken word of "baru" (word 15), leaves right after word 20 ends): rounded card radius 32, fill white at 80%, title "ANAK FLAMINGO" 44 px, rows "Baru menetas" and "Bulu: abu-abu keputihan" 38 px, icon: a cracked eggshell shape in #F9C4CF. It must be gone before the phrase below enters.

TEXT (kinetic, upper band, 96 px): phrase words 21 to 24 ("Pink bukan bawaan lahir"), emphasis on word 22 (bukan).

ENVIRONMENT LOOP: reeds sway; two slow ripples on the water edge; 8 dust-like particles in the foreground.

SFX: pop when the card enters (0.25); pop at the first word of the phrase (0.2); whoosh at TIMING.scenes[2].from - 14 (0.25).

ENTER: fade. EXIT: fade (the next scene enters with slide-up).

DONE WHEN:
1. The card is on screen only during words 15 to 20 and never together with the phrase.
2. The chick and the ranger visibly move at all times; the camera drift is smooth.
3. The phrase enters on word 21, +-3 frames, emphasis on 'bukan'.
4. Everything important is inside SAFE.

VERIFY: render stills at scene-local frames 0, 80, last with: npx remotion still src/index.ts Episode out/s02-<frame>.png --frame=<absolute frame>. Open each still. Fix anything that breaks DONE WHEN, then stop and report which checks passed.
```

**Voice-over**

> Anak flamingo yang baru menetas berbulu halus, abu-abu keputihan.
> Pink bukan bawaan lahir... itu harus ditumbuhkan.

### SCENE 03: SOURCE

**Planned time:** 11.2 to 17.6 s   **Words:** 28 to 43

**Purpose:** Name the source of the color: food.

```text
TASK: Implement Scene 03 ("Source") in src/episodes/flamingo/Scene03.tsx. Read BRIEF.md and episode.data.ts first. Use TIMING.scenes[2].

VISUALS (back to front):
- [0.00] warm sky gradient only (the scene is mostly underwater, the sky is a thin band at the top, y 0-18%).
- [0.15] soft teal water haze #BFD8D2 with light shafts, blur 8 px.
- [0.30] shallow lagoon floor in #7FC6BE with a darker lower band, blur 4 px.
- [0.50] subject plane, cutaway: 5 green algae strands (capsules, height 14% of frame, waving +-6 degrees at 0.4 Hz, each with its own phase), 7 round orange-pink shrimp (circles 36-52 px, #F58AA0 with a darker curl), and from the top the head and long neck of an adult flamingo (#F58AA0, bill #2B3A42 tip) dipped upside down at x 68%, y 12% to 46%, sieving; its bill opens and closes every 0.8 s.
- [0.70] a few round bubbles rising; [0.90] one big blurred algae blade at the left edge.
- Carotenoid dots: 12 small glowing dots (#F58AA0 core, #F9C4CF halo, radius 10-16 px) lift out of the algae and shrimp starting at word 40 and travel along curved paths toward the flamingo's bill over 40-70 frames, staggered 3 frames apart.

TAGS (attached with a short leader line to what they name, 56 px, SPRINGS.snappy): "alga" at word 34, "udang" at word 36; both leave at word 39.
TEXT (kinetic, upper band, 96 px): words 40 to 43 ("pigmen alami bernama karotenoid"), emphasis on word 43.
FOOTNOTE (lower band, 32 px, appears at word 40): "Ilustrasi disederhanakan."

CAMERA: push-in, frame 0 zoom 1.10, y 0; last frame zoom 1.35, y 80; focus 0.5.

SFX: pop at the two tags (0.2 each); tick at the first word of the phrase (0.2); whoosh at TIMING.scenes[3].from - 14 (0.25).

ENTER: slide-up. EXIT: slide-up.

DONE WHEN:
1. Tags are attached to their shapes and gone before the phrase starts.
2. The dots start rising on word 40 and reach the bill by word 43.
3. The algae, the shrimp, the flamingo's bill and the bubbles all move.
4. Everything important is inside SAFE; the footnote is visible and at least 30 px.

VERIFY: render stills at scene-local frames 0, 70, last with: npx remotion still src/index.ts Episode out/s03-<frame>.png --frame=<absolute frame>. Open each still. Fix anything that breaks DONE WHEN, then stop and report which checks passed.
```

**Voice-over**

> Warnanya datang dari makanan.
> Flamingo menyaring alga dan udang kecil... yang penuh pigmen alami bernama karotenoid.

### SCENE 04: MECHANISM

**Planned time:** 17.6 to 22.4 s   **Words:** 44 to 55

**Purpose:** Explain the mechanism in the simplest diagram: food, body, feather.

```text
TASK: Implement Scene 04 ("Mechanism") in src/episodes/flamingo/Scene04.tsx. Read BRIEF.md and episode.data.ts first. Use TIMING.scenes[3].

VISUALS (back to front):
- [0.00-0.30] the lagoon softly blurred (8 px), colors dimmed 15% so the diagram is the focus.
- [0.50] diagram, vertical, between y 480 and 1350, centered at x 50%: (1) icon of algae and a shrimp (160 px); (2) an arrow down (a dashed line with a moving dash), 140 px; (3) a light-gray flamingo silhouette #CBD0D8, 330 px tall; (4) an arrow down; (5) a single large feather, 360 px tall, rotated 20 degrees. Carotenoid dots (radius 10 px) travel along the arrows every 20 frames.
- The feather's color changes from #CBD0D8 to #F58AA0 growing from its base to its tip: animate a clip or gradient mask with interpolate over about 70 frames, starting at word 51 ("bulu-bulu") and ending at the last word.
- [0.70] ranger at the lower left (x 16%, y 74%), small (22% of frame height), nodding every 2 s.

TEXT (kinetic, upper band y 192-420, 88 px): words 51 to 55 ("bulu-bulu baru yang sedang tumbuh"), emphasis on word 51.
FOOTNOTE (lower band, 32 px): "Ilustrasi disederhanakan."

CAMERA: almost still, zoom 1.0 to 1.06, focus 0.5.

SFX: tick at the start of the phrase (0.2); soft pop when the feather color starts to change (0.2); whoosh at TIMING.scenes[4].from - 14 (0.25).

ENTER: slide-left. EXIT: slide-left.

DONE WHEN:
1. The feather is fully pink at the last spoken word and gray before word 51.
2. Dots move along both arrows continuously; the ranger and the camera also move.
3. The diagram stays inside SAFE and does not touch the phrase or the footnote.
4. Each icon is drawn from simple shapes and specific to this story.

VERIFY: render stills at scene-local frames 0, 60, last with: npx remotion still src/index.ts Episode out/s04-<frame>.png --frame=<absolute frame>. Open each still. Fix anything that breaks DONE WHEN, then stop and report which checks passed.
```

**Voice-over**

> Tubuhnya mengolah pigmen itu... lalu menyimpannya di bulu-bulu baru yang sedang tumbuh.

### SCENE 05: THE RED "MILK" (BOLD MOMENT)

**Planned time:** 22.4 to 32.4 s   **Words:** 56 to 80

**Purpose:** Deliver the surprising fact: both parents make a bright red "milk" that carries the pigments to the chick. The one bold moment of the episode.

```text
TASK: Implement Scene 05 ("The bold moment") in src/episodes/flamingo/Scene05.tsx. This is the only scene allowed to use sun rays, a riser and a large camera move. Read BRIEF.md and episode.data.ts first. Use TIMING.scenes[4].

VISUALS (back to front):
- [0.00] sunrise sky, the sun low at x 25%, y 52%, radius 120 px, warm #FFE3A3.
- [0.15] far hills; [0.30] lagoon and the whole flock in the distance (about 30 tiny pink shapes, varied scale and idle phase), all blurred at first because the camera starts zoomed in.
- [0.50] subject plane: on the nest mound at x 50%, y 62%, a gray chick (22% of frame height) with its bill raised; an adult pink flamingo bends its head down to it. A thin glowing stream (#E4577A core, #F9C4CF glow, width 14 px, gentle wave) runs from the parent's bill to the chick's bill, flowing at 60 px per second.
- [0.70] a second adult flamingo that steps into frame from the right beginning at word 70; [0.90] reed blades heavily blurred (12 px) and cropped at the edges.
- <SunRays> from the sun, opacity 0 until word 67, then up to 0.55 over 45 frames; fade out in the last 20 frames.

CAMERA (scene-local): hold zoom 2.4, y 120 until word 67, then ONE eased pull-back to zoom 1.0, y 0 over 150 frames; focus 0.5 throughout.

TEXT (kinetic, upper band, 96 px):
- Phrase A, words 59 to 63 ("belum bisa menyaring makanan sendiri"), emphasis on word 59, holdFrames 4.
- Phrase B, words 68 to 70 ("susu merah terang"; the narration says "susu" in quotes: show the word in quotation marks), emphasis on word 69, holdFrames 4.
- Phrase C, words 78 to 80 ("pigmen yang sama"), emphasis on word 78.
FOOTNOTE (lower band, 32 px, from word 68): "Bukan susu seperti pada mamalia."

CHARACTER: the parent's neck moves in a slow 4 px pulse; the chick's bill opens and closes every 1.2 s; the ranger appears small in the lower right corner after the pull-back finishes and smiles (mouth curve change).

SFX: riser ending exactly at the pull-back start (start it 36 frames earlier, volume 0.3); chime at the pull-back start (0.3); pop at the start of phrases A, B and C (0.2 each); whoosh at TIMING.scenes[5].from - 14 (0.25).

ENTER: fade. EXIT: fade.

DONE WHEN:
1. The pull-back starts on word 67, +-4 frames, and is one smooth eased move (no shake).
2. Rays appear only after word 67 and stay soft (opacity at most 0.55).
3. Phrases A, B, C never overlap; each is on its spoken words, +-3 frames.
4. The stream is visible, thin and not graphic; nothing looks like blood.
5. At least three things move in every second; everything important is inside SAFE.

VERIFY: render stills at scene-local frames 0, 90 (before the pull-back), 150, last with: npx remotion still src/index.ts Episode out/s05-<frame>.png --frame=<absolute frame>. Open each still. Fix anything that breaks DONE WHEN, then stop and report which checks passed.
```

**Voice-over**

> Tapi anak flamingo belum bisa menyaring makanan sendiri.
> Jadi kedua induknya membuat "susu" merah terang di tenggorokan mereka... dan susu itu membawa pigmen yang sama.

### SCENE 06: THE COST

**Planned time:** 32.4 to 37.6 s   **Words:** 81 to 93

**Purpose:** Add the counterpoint that makes the story credible.

```text
TASK: Implement Scene 06 ("The cost") in src/episodes/flamingo/Scene06.tsx. Read BRIEF.md and episode.data.ts first. Use TIMING.scenes[5].

VISUALS (back to front):
- [0.00-0.30] calm sunrise sky, hills and lagoon, blur 4-6 px.
- [0.50] subject plane: two adult flamingos on the shore side by side, the chick between them (adults 40% of frame height, chick 18%). The LEFT parent starts in rich pink #F58AA0; as the camera drifts, its feather fill moves to pale pink #F9C4CF (interpolateColors over 60 frames, starting at word 88). The right parent stays #F58AA0.
- [0.70] the ranger far right (x 86%), small, notebook open, blur 8 px, tilting his head sympathetically.
- [0.90] reeds slide past.

TAGS (attached to the left parent with a leader line, 56 px, SPRINGS.snappy): "Sebelum" at word 85 (leaves at word 90); "Setelah membesarkan anak" at word 91 (stays to the end of the scene).
TEXT (kinetic, upper band, 96 px): words 83 to 84 ("ada harganya"), emphasis on word 84, holdFrames 4; words 92 to 93 ("lebih pucat"), emphasis on word 93.

CAMERA: lateral drift, zoom 1.15, x 0 to 140, focus 0.5.

SFX: pop at the first word of each phrase (0.2); soft tick when each tag appears (0.15); whoosh at TIMING.scenes[6].from - 14 (0.25).

ENTER: slide-left. EXIT: slide-left.

DONE WHEN:
1. The left parent is clearly paler than the right parent by the last spoken word.
2. Tags and phrases never overlap each other; the tags are attached to the parent.
3. A touch of humor shows in the ranger's reaction; the mood stays gentle.
4. Everything important is inside SAFE.

VERIFY: render stills at scene-local frames 0, 80, last with: npx remotion still src/index.ts Episode out/s06-<frame>.png --frame=<absolute frame>. Open each still. Fix anything that breaks DONE WHEN, then stop and report which checks passed.
```

**Voice-over**

> Dan itu ada harganya...
> Membesarkan anak bisa membuat bulu induknya jadi lebih pucat.

### SCENE 07: FED PINK

**Planned time:** 37.6 to 41.6 s   **Words:** 94 to 103

**Purpose:** Land the twist line and resolve the hook.

```text
TASK: Implement Scene 07 ("Takeaway") in src/episodes/flamingo/Scene07.tsx. Read BRIEF.md and episode.data.ts first. Use TIMING.scenes[6].

VISUALS (back to front):
- [0.00] bright sunrise sky; [0.15] hills; [0.30] the lagoon lit warm, with the full pink flock standing in it (about 24 shapes, varied scale, idle phases, #F58AA0 and #F9C4CF); [0.50] time-lapse in the subject plane: the gray chick grows into a young bird (mixed gray-pink) and then a fully pink adult in three eased steps (color via interpolateColors, size +25% per step), x 50%, y 66%; [0.70] the ranger waves from the left corner (arm rotation oscillates +-25 degrees at 1.5 Hz); [0.90] foreground reeds sliding left at 40 px per second.
- A small label "beberapa tahun kemudian" (56 px, SPRINGS.snappy) near the growing bird from word 99 for 40 frames.
- No sun rays in this scene (they belong to Scene 05); keep the light warm and soft.

TEXT (kinetic, upper band, 104 px): words 96 to 98 ("tidak lahir pink"), emphasis on word 96, holdFrames 4; words 100 to 103 ("diberi makan jadi pink"), emphasis on words 100 and 103.

CAMERA: tilt-up reveal, zoom 1.0 to 1.10, y 0 to -300, focus 0.5 to 0.3 (the flock becomes the subject).

SFX: pop at the first word of each phrase (0.2); soft chime when the bird becomes fully pink (0.2); whoosh at the start of the end card minus 14 frames (0.25).

ENTER: slide-up. EXIT: fade.

DONE WHEN:
1. The bird is fully pink on the last word; the three growth steps are visible and eased.
2. The tilt-up is smooth and the flock is the focus at the end.
3. Both phrases are on their spoken words, +-3 frames, never together.
4. Everything important is inside SAFE.

VERIFY: render stills at scene-local frames 0, 60, last with: npx remotion still src/index.ts Episode out/s07-<frame>.png --frame=<absolute frame>. Open each still. Fix anything that breaks DONE WHEN, then stop and report which checks passed.
```

**Voice-over**

> Jadi flamingo tidak lahir pink... mereka diberi makan jadi pink.

### SCENE 08: END CARD

**Planned time:** the last 4 seconds

```text
TASK: Implement the end card in src/episodes/flamingo/EndCard.tsx. Read BRIEF.md first. Duration is TIMING.endCard.duration.

VISUALS: warm sunburst gradient from #FFE3A3 (center) to #F9C4CF (edge), subtle grain. Center: the twist line "Lahir abu-abu. Diberi makan pink." at 100 px, rounded bold, ink color, max 3 lines, width at most 896 px, appearing word by word (SPRINGS.pop, 4 frames apart); "pink" in #E4577A. Below it: a small flat flamingo feather icon (160 px) that gently rotates +-6 degrees. Bottom (inside SAFE): "Everyday Why #01" and "Ikuti untuk #02" at 34 px. Very slow pull-back (zoom 1.15 to 1.0); six soft rays rotate slowly behind the text (opacity 0.35).

SFX: chime at the first frame of the end card, volume 0.3. No voice-over.

DONE WHEN: the twist line is fully visible for at least 1.5 seconds, inside SAFE, and the watermark is still visible.

VERIFY: render stills at the first frame, 1.5 s in and the last frame. Fix and stop.
```

## 6. PF: Final assembly and QA prompt (paste after all scenes are built)

```text
TASK PF: assemble and check episode flamingo. Read src/episodes/flamingo/BRIEF.md first.

1. In Episode.tsx make sure: one <MasterAudio> for the whole episode; scenes overlap by 14 frames; each transition has a whoosh cue in SFX; <Watermark/>, <Vignette/>, <Grain/> are on top of all scenes.
2. Render stills at: frame 0, the middle of every transition, the emphasized word of every phrase, and the last frame. Add <SafeAreaDebug/> temporarily. Look at every still.
3. Check and fix: (a) no text or key shape outside SAFE, (b) no text over a face or subject, (c) no two phrases on screen together, (d) the watermark is visible in every still, (e) at least three things move in every scene (compare two stills 20 frames apart), (f) the total duration equals voiceover length + 0.5 s + end card, (g) no enter/exit pair repeats twice in a row, (h) no more than 6 SFX events in any 10 seconds.
4. Remove <SafeAreaDebug/>. Render: npx remotion render src/index.ts Episode out/flamingo.mp4 --codec h264
5. Report: a table of checks (a)-(h) with pass or fail, final duration, file size, and anything you changed.
```

## 7. Recommended final structure

```text
SCENE 01 HOOK        0:00-0:05   "Semua flamingo lahir berwarna abu-abu... dari mana warna pink itu datang?"
SCENE 02 SETUP       0:05-0:11   "Pink bukan bawaan lahir"
SCENE 03 SOURCE      0:11-0:18   "pigmen alami bernama karotenoid"
SCENE 04 MECHANISM   0:18-0:22   "bulu-bulu baru yang sedang tumbuh"
SCENE 05 BOLD MOMENT 0:22-0:32   "susu merah terang... pigmen yang sama"
SCENE 06 COST        0:32-0:38   "ada harganya... lebih pucat"
SCENE 07 FED PINK    0:38-0:42   "tidak lahir pink... diberi makan jadi pink"
END CARD             0:42-0:46   "Lahir abu-abu. Diberi makan pink."
```
(Planned times; real times come from the voice-over timestamps.)

## 8. Series log row

`| 01 | flamingo | lagoon sunrise | ranger: yellow hat, green outfit, notebook | question hook ("dari mana warna pink?") | tilt-up and pull-back reveal | pull-back with soft rays (red "milk") | Lahir abu-abu. Diberi makan pink. | (measure after audio exists) |`