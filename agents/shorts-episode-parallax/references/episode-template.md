# Episode file template (2.5D parallax)

Fill every placeholder in `<angle brackets>`. Keep section order and headings, because the user pastes these files into Codex and expects the same structure every time. Delete this paragraph in the output.

---

````markdown
# <Series Name> #<NN> — <Episode title as a question or claim>

## Project Overview

- **Series:** <Series name>
- **Episode:** #<NN>
- **Topic:** <One sentence: the question the episode answers, with the answer in brackets>
- **Format:** YouTube Shorts
- **Aspect Ratio:** 9:16
- **Visual Style:** Bright 2.5D parallax flat-vector animation, layered scenery, simple cartoon characters, soft depth-of-field blur, warm light (see Global Visual Rules)
- **Production:** Codex + Remotion for scene visuals, camera, timing, captions, and polish. ElevenLabs for voice-over.
- **Language:** English voice-over and English on-screen captions <or: Indonesian on-screen text>
- **Target Duration:** Approximately <42-50> seconds
- **Series constants:** Same flat-vector look with no outlines, soft ground shadows, paper grain, rounded sans typeface, info-card style, and end-card layout as earlier episodes.
- **Variation vs previous episode:** <What changed: setting and palette family, main character, hook formula, primary camera move, bold-moment type. For #01: "First episode of the series; this sets the constants.">
- **Link to #<NN-1>:** <Optional. How this episode connects to the previous one. Omit for #01 or when there is no natural link.>

## Core Message (accuracy note)

Verified facts the script relies on (with sources):

- <fact 1, precise enough to be checkable> (<source name>)
- <fact 2> (<source name>)
- <what is simplified or invented, if anything; say the video must not claim it is exactly how it looks in reality>

Wording rules for the script and captions:
- Do NOT say "<overclaim 1>". <one-line reason>
- Do NOT say "<overclaim 2>". <one-line reason>
- Never show or name a real product, logo, or interface. Never copy an existing cartoon character or channel mascot.
- Mark simplified parts with a small footnote: "Simplified illustration."
- <topic-specific do-nots>

Key twist: **<the one line the viewer remembers>**

---

# 🎨 Component Design

Design all on-screen UI components (<list: info card, labels, arrows, caption pills, end-card elements>) using the bundled style-bible.md guidance, so they feel intentional and specific to this story rather than templated defaults.

Keep the series constants exactly as defined above: the same typeface, caption style, info-card style, and end-card layout.

Spend the visual boldness on one moment, <describe the reveal: for example the pull-back reveal with light rays in Scene 05>. Keep every other scene calm.

## Palette (this episode)

| Role | Hex | Used for |
|---|---|---|
| Sky / backdrop | <#......> | <...> |
| Far scenery | <#......> | <...> |
| Mid scenery | <#......> | <...> |
| Subject accent | <#......> | <...> |
| Character outfit | <#......> | <...> |
| Ink (text, constant) | <#......> | text and thin details |

## Layer Map

| Depth | Layer | Contents | Blur when not in focus |
|---|---|---|---|
| 0.00 | Sky | <...> | none (very far, soft gradient) |
| 0.15 | Far scenery | <...> | light |
| 0.30 | Mid scenery | <...> | light |
| 0.50 | Subject plane | <main character and subject> | in focus |
| 0.70 | Near props | <...> | medium |
| 0.90 | Foreground | <...> | heavy, partly cropped |

## Camera Plan

| Scene | Move | From → To (zoom / focus) | Notes |
|---|---|---|---|
| 01 | <slow push-in> | <1.15 → 1.30 / focus 0.5> | <...> |
| ... | | | |

---

# 🎬 SCENE 01 — HOOK

**Suggested duration:** 0-<4-5> seconds

## Purpose

<What this scene does for the viewer.>

## Codex Prompt

```text
Create a vertical 9:16 2.5D parallax flat-vector animation scene for a faceless YouTube Short, in a warm, friendly explainer style.

<Describe the scene back to front: sky, far scenery, mid scenery, subject plane with the character, near props, foreground. Say which layers are blurred and which is in focus.>

<Describe the camera move and how far it travels.>

<Describe character action and idle motion.>

On-screen text: "<exact text>"

The mood should be <warm and curious>.

No real people, no real brand logos or interfaces, no existing cartoon characters, no photos or generated images (everything is drawn with code), no heavy outlines, no scary imagery. Keep important elements inside the mobile safe area. 9:16 vertical.
```

## Voice-over

> <narration lines>

---

# <emoji> SCENE 02 — <TITLE>

<Same structure. Start the Codex prompt with: "Create a vertical 9:16 2.5D parallax flat-vector animation scene continuing directly from the previous scene. Continue the exact same visual identity, characters and palette as the previous scene." Repeat for each scene. Typical arc: Hook, Setup, Source or Mechanism, Detail, Bold moment, Cost or counterpoint, Takeaway, End card.>

---

# 🖥️ SCENE <LAST> — END CARD

**Suggested duration:** <3-4> seconds

## Purpose

Create a memorable branded ending that keeps the <Series name> constants.

## Codex Prompt

```text
<End card prompt: the twist line as large rounded-sans text over a warm sunburst gradient, a small flat illustration of the episode's key subject, series name and episode number, slow pull-back or tilt, grain, 9:16 vertical.>
```

## Voice-over

No voice-over is required for the end card.

Optional ending sound design:
- soft rising chime
- gentle air whoosh
- short warm pop

Optional small text near the bottom (inside safe area): "Follow for #<NN+1>"

---

# 🎙️ Full English Voice-over

Use this as the master narration for the complete episode:

> <paste-ready narration, one beat per line, blank lines for pauses>

Approx. <N> words, about <X-Y> seconds with pauses.

---

# 🎞️ Recommended Final Structure

```text
SCENE 01 — <NAME>
0:00–0:05
"<key line>"

        ↓

SCENE 02 — <NAME>
...
```

---

# 🎨 Global Visual Rules

- Vertical 9:16
- Bright, warm, flat-vector look: no outlines, soft elliptical ground shadows, subtle paper grain
- 2.5D parallax: separate depth layers that move at different speeds with the camera
- Soft depth-of-field blur on near and far layers; the subject plane stays sharp
- Simple cartoon characters built from basic shapes, with small expressive motion (blink, bob, point)
- One rounded sans-serif typeface family
- Limited palette per episode (about 6-8 colors plus ink)
- Warm light and sun rays reserved for the bold moment
- Plenty of negative space; one idea per scene
- No real people, no photos, no generated images: every visual is drawn with code
- No existing cartoon characters or channel mascots
- No scary, graphic, or alarming effects
- Never show real product logos, names, or interfaces
- Mark simplified parts with a small footnote
- Keep important visual elements and captions inside mobile safe areas
- Maintain consistent visual language between scenes

## Production Note

Codex should primarily generate the visual scenes with Remotion, using one reusable depth-layer and camera component for every scene.

Remotion should also handle:
- final scene timing
- camera keyframes (see the Camera Plan)
- transitions between scenes
- voice-over synchronization (ElevenLabs audio + word-level captions)
- subtitles/captions
- typography that must be pixel-perfect
- sound effects
- background music
- final branding
- final 1080×1920 composition

All UI components should follow the Component Design section above.

Performance: keep each scene to about 8 layers and at most 3 blurred layers on screen at once. Static far layers can be blurred once and reused instead of blurring every frame. Avoid full-screen SVG filters.

Implementation tip: <if any scene is driven by data (steps, quantities, colors over time), keep it in one data file and drive the visuals from it so the scenes stay consistent. Give the concrete data.>

<If a component repeats from an earlier episode, say to reuse it here and how it should differ.>

This separation makes each scene easier to replace or regenerate without rebuilding the entire video.
````
