# Style bible: 2.5D parallax explainer

Two readers use this file. The **author** (writes the episode file) uses it to choose palette, character, camera and wording. The **builder** (Codex, builds the video in Remotion) uses it as the quality bar. Everything described here can be drawn by code.

Contents: 1 Constants and variables · 2 Style variants · 3 Palette · 4 Depth layers · 5 Characters · 6 Motion and liveliness · 7 Camera · 8 Light · 9 Kinetic typography · 10 Transitions · 11 Component design rules · 12 Branding · 13 Safe area · 14 Sound · 15 Failure modes and fixes

The look: flat vector illustration without outlines, drawn in layers, with a virtual camera that pushes in and pulls back so the layers slide past each other at different speeds. Far and near layers are softly blurred while the subject stays sharp. Characters are simple and friendly. Light (sun rays, glow) is saved for the one big reveal. It is inspired by the explainer-animation genre. Use it as a *style* reference only; never copy another channel's characters, mascots, logos or scenes.

## 1. Series constants vs episode variables

| Constant (never changes) | Variable (changes every episode) |
|---|---|
| Flat vector, no outlines (see variants) | Setting and palette family |
| Soft elliptical ground shadows | Main character design and role |
| Subtle paper grain and vignette | Hook formula |
| One rounded sans-serif family | Primary camera move |
| Kinetic typography rules (section 9) | Type of bold moment |
| Transition language (section 10) | Props and background details |
| Info-card style, end-card layout | Narration sentence rhythm |
| "Mystery Lab" watermark (section 12) | |
| Sound language (section 14) | |

## 2. Style variants

The default is **flat-parallax** (this whole file). A variant changes the *look* only; kinetic typography, transitions, watermark, safe area and sound rules stay the same. Name the variant in the episode's `Visual Style` line.

| Variant | What changes |
|---|---|
| flat-parallax (default) | As described in this file |
| comic | Thick ink outlines allowed (6-8 px, ink color), halftone dot texture on shadows, flat fills with one spot color, caption-box style labels, info cards shaped like comic panels, "panel" moves (zoom into a panel, slide to the next) instead of parallax-only moves |

## 3. Palette rules

- About 6-8 flat colors per episode plus one ink color for text. Ink is a constant dark blue-gray (for example `#2B3A42`).
- Three groups: **backdrop** (sky, far hills; desaturated, lighter), **middle** (the setting; medium saturation), **subject** (character and the thing being explained; the most saturated colors on screen).
- Far layers get lighter and cooler with distance. Near layers get slightly darker and warmer.
- Palette families to rotate through: lagoon sunrise (peach, mint, teal), kitchen interior (cream, terracotta, sage), night sky (indigo, violet, warm yellow), desert noon (sand, coral, sky blue), forest morning (olive, moss, amber), harbor dusk (slate blue, orange, rose), volcanic ash (charcoal, ember orange, pale gray). Never the same family twice in a row (check `series-log.md`).
- No pure black, no neon, no red or warning colors unless the topic truly calls for them. Keep text contrast high: dark ink on light, white on dark pills.

## 4. Depth layers

Depth runs from 0 (infinitely far) to 1 (closest). It controls how fast a layer moves with the camera, how much it scales during zooms, and how blurred it is out of focus.

| Depth | Layer | Typical contents |
|---|---|---|
| 0.00 | Sky | Gradient, soft clouds, sun or moon |
| 0.15 | Far scenery | Mountains, skyline, distant trees |
| 0.30 | Mid scenery | Buildings, fences, main trees |
| 0.50 | Subject plane | Character and the thing explained; the default focal plane |
| 0.70 | Near props | Crates, plants, animals close to the subject |
| 0.90 | Foreground | Large blurred leaves, edges of objects, partly cropped |

- The subject plane is sharp unless a rack focus moves the focus elsewhere.
- Maximum blur about 8-14 px at 1080×1920 for the farthest layers and the foreground.
- At most about 8 layers per scene and 3 blurred layers at once.
- In 9:16, stack the world vertically: sky at the top, scenery upper-middle, subject lower-middle, foreground at the bottom. Do not crop a horizontal landscape.

## 5. Characters

- Head: circle. Body: rounded rectangle or trapezoid. Limbs: capsules. Hands and feet: small circles. Face: two dark ovals, a small curve for a mouth.
- A hat, hair shape or headband gives each character a silhouette. **Change silhouette, proportions and outfit every episode**; two episodes in a row must not share a head-to-body ratio.
- Fill colors only: skin, outfit (two colors), accessory, one darker tone for shading. No gradients on the body.
- Each character has 3-4 poses (idle, pointing, surprised, holding something). Swap poses at beat changes, with a 6-10 frame tween.
- Animals and objects: simplified silhouettes with two or three markings. Mechanisms are simplified cutaways or diagrams with arrows, labeled "Ilustrasi disederhanakan."
- Groups (flock, crowd): same shapes with small differences in scale, color and idle `phase`.

## 6. Motion and liveliness

The most common reason a Remotion video feels cheap is that things sit still. Rules:

- **Three motions at all times:** the camera, the character (idle), and at least one environment loop. Nothing is perfectly still for more than 1 second.
- Idle loops (use `useIdle` / `useBlink` from the engine):

| Element | Motion |
|---|---|
| Character | Bob 3-5 px at 0.7-0.9 Hz; blink every 2-4 s (closed 3-4 frames); small head turn on beat changes |
| Plants, reeds | Rotate ±2° at 0.2-0.35 Hz, each with its own phase |
| Clouds, mist | Drift 8-20 px per second |
| Water, light | Slow ripple or shimmer, amplitude under 6 px |
| Particles | 6-14 dots in the foreground drifting at different speeds |

- **Entrances** use springs, not linear fades: `SPRINGS.pop` for text and small items, `SPRINGS.soft` for panels and cards, `SPRINGS.snappy` for UI chips. Stagger related items 3-5 frames apart.
- **Camera** uses ease-in-out (cubic). Moves last 90-300 frames. Hold still for a beat on each key line.
- Anticipation for big moves: 4-6 frames of a small opposite move before the main move (optional, one per episode).
- Pose changes and color changes use eased tweens of 8-24 frames, never instant swaps.

## 7. Camera

The camera has x, y, zoom and a focus depth, animated with keyframes.

| Move | What it does | Use for |
|---|---|---|
| Push-in | Slow zoom toward the subject (1.1 → 1.3) | Hook, emphasis |
| Pull-back reveal | Zoom out (2.4 → 1.0) | The bold moment, scale or context |
| Tilt-up reveal | Camera rises to show what is above | Vertical reveals |
| Lateral drift | Slow sideways travel (x 0 → 120) | "Meanwhile" beats, continuing a slide transition |
| Rack focus | Focus depth shifts from one layer to another | Directing attention |

- One primary move per episode as the signature; secondary moves are small (zoom change under 0.2, travel under 140 px).
- Never whip or shake; it reads as noise on a phone.

## 8. Light and atmosphere

- **Sun rays and glow** only for the bold moment: a few soft translucent wedges from a light source, screen blending, low opacity.
- **Vignette** on every scene (very subtle). **Grain** overlay a few percent (series constant). Floating particles only in foreground layers.
- No lens flares, no heavy bloom, no color grading that changes between scenes.

## 9. Kinetic typography (educational)

The on-screen text is the narration made visible. It exists to help the viewer follow and remember, not to decorate.

- Words come from the voice-over timestamps, so each word appears exactly when it is spoken. Use `<KineticLine>`.
- **One phrase at a time**, 2-6 words, maximum 2 lines, centered, width at most 896 px.
- Sizes at 1080×1920: key phrase 84-104 px, supporting text 64-72 px, footnotes 30-34 px. Nothing the viewer must read is below 56 px.
- **Emphasis on 1-2 words per phrase** (accent color, underline sweep, small overshoot). Emphasize the word the voice stresses, not just the noun.
- A phrase leaves about 20 frames after its last word, with an 8-frame exit. Never two phrases on screen together.
- Text never covers the character's face or the thing being explained. Choose the upper third (y 192-600) or the lower-middle band (y 1000-1300) per scene and keep that choice for the whole scene.
- Numbers and dates count up or tick into place. Labels attach to what they name (arrow or adjacency), never float alone.
- Bold weight, rounded sans-serif, dark ink on light backdrops or white on a dark rounded pill. Soft shadow only for legibility.

## 10. Transitions

No hard cuts. Scenes overlap by 12-18 frames (default 14): the outgoing scene is still moving while the incoming scene arrives (`<SceneShell>`).

| Pair | When |
|---|---|
| fade → fade | Calm continuation |
| fade → slide-up | A reveal or a new idea |
| slide-up → slide-left | Moving "along" the scene, continues a lateral drift |

- Do not use the same pair twice in a row. Carry one element across the cut when possible (a foreground leaf, a light ray, a color that continues).
- A soft whoosh starts with the transition (see section 14).

## 11. Component design rules

Applies to the info card, labels, arrows, caption pills, chips and the end card. If the `/top-design` skill is installed, apply it. If not, apply these rules.

**Specificity test.** Each UI piece must contain at least one thing that exists only in this episode: a palette color, a shape motif from the subject (feather, bolt, wave), or wording from the narration. If a piece could be pasted unchanged into another episode, redesign it.

**Info card**
- Rounded rectangle (radius 28-40 px), white or palette-tinted fill at 78-85 percent opacity, soft shadow, one small flat icon in a rounded square.
- Bold uppercase title (40-46 px), two to four key-value rows (36-40 px). Enters with `SPRINGS.soft` from 60 px to the side, leaves the same way. One card on screen at most.
- Gray placeholder bars only when the card represents a document or profile.

**Do not**
- Default purple-blue gradients, glassmorphism on everything, emoji as icons, system-default fonts.
- The same white card repeated for every fact, or a centered stack of equal-width boxes.
- Arrows that do not touch what they point to, labels with no connection to a shape.

**Do**
- Vary shape language per episode (pill, tab, ribbon, tag) while keeping series constants (type family, caption style, safe area).
- Spend design effort on the one bold moment; keep the rest quiet.

## 12. Branding

- Watermark text `Mystery Lab`, bold rounded sans-serif, 38 px, ink color at 60 percent opacity, top-left at x 54, y 120. Rendered once in `Episode.tsx` above all scenes, so it appears on every frame including the end card.
- End card: the twist line large over a warm sunburst gradient, a small flat illustration of the key subject, series name and episode number, slow pull-back, grain. Keep the layout identical between episodes; only the line and the illustration change.

## 13. Safe area (1080×1920)

- Content that matters stays inside `SAFE` (left 54, right 130, top 192, bottom 480 px, from `src/engine/overlays.tsx`). Shorts and TikTok draw their UI over the bottom and right edges; layouts change, so preview an upload in the app.
- Backgrounds and foreground layers may fill the whole frame. During development, draw `<SafeAreaDebug/>` in stills to catch overlaps.

## 14. Sound

- **Voice-over:** one continuous file for the whole episode, never cut per scene. Made outside the video (Voicebox or any TTS), delivered with word timestamps (from the provider if it offers them, otherwise from speech recognition plus `alignWords`). Volume 1.0.
- **Music:** calm, no lyrics, volume 0.08-0.12, 20-frame fade-in, 45-frame fade-out. Optional.
- **SFX map** (`SfxCue` at absolute frames in `episode.data.ts`):

| Moment | Sound | Volume |
|---|---|---|
| Scene transition (at the start of the overlap) | whoosh | 0.20-0.28 |
| Key phrase or info card enters | pop or tick, once per phrase | 0.15-0.25 |
| Into the bold moment | riser (1.2 s) ending at the reveal | 0.30 |
| The reveal itself | chime | 0.30 |
| End card | chime | 0.30 |

- At most 6 SFX events in any 10 seconds, none stacked on the first 150 ms of an emphasized word. `node scripts/make-assets.mjs` creates placeholder sounds; replace them with better ones whenever you have them.

## 15. Failure modes and fixes

| Symptom | Cause | Fix |
|---|---|---|
| Scene feels like a slideshow | Fewer than three motions | Add an environment loop and character idle (section 6) |
| Text overlaps the character | Position not planned | Pick upper or lower band per scene (section 9) |
| Text appears before or after the voice | Hardcoded frames | Use `WORDS` timestamps and anchors |
| Every transition looks the same | Default fade reused | Follow the pair table (section 10) |
| Everything is blurry | More than 3 blurred layers or maxBlur too high | Cap at 3, maxBlur 8-14 |
| Cards look generic | Specificity test failed | Redesign with episode palette and motif (section 11) |
| Characters look alike across episodes | Same proportions reused | Change ratio, hat, outfit (section 5) |
| Audio has gaps or jumps | Voice-over split per scene | One file, one `<MasterAudio>` |
| Watermark or text hidden by app UI | Outside safe area | Move inside `SAFE`; preview in the app |
| Render takes very long | Blurred full-screen layers | Bake static blurs, reduce layers, preview at half scale |