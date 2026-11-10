# Everyday Why #01 — Why Is Every Flamingo Born Gray?

## Project Overview

- **Series:** Everyday Why
- **Episode:** #01
- **Topic:** If flamingos are famous for being pink, why are the chicks gray? (The pink comes from pigments in their food, and the parents pass those pigments to the chick through a bright red "crop milk".)
- **Format:** YouTube Shorts
- **Aspect Ratio:** 9:16
- **Visual Style:** Bright 2.5D parallax flat-vector animation, layered scenery, simple cartoon character, soft depth-of-field blur, warm light
- **Production:** Codex + Remotion for scene visuals, camera, timing, captions, and polish. ElevenLabs for voice-over.
- **Language:** English voice-over and English on-screen captions
- **Target Duration:** Approximately 46-48 seconds (44 seconds of narration plus a 4-second silent end card)
- **Series constants:** This episode sets them: flat vector with no outlines, soft elliptical ground shadows, subtle paper grain, one rounded sans-serif typeface, the info-card style, and the end-card layout (twist line over a sunburst gradient, series name, episode number, "Follow for #NN").
- **Variation vs previous episode:** First episode of the series; this sets the constants. (Lagoon-sunrise palette, wetland-ranger character, "Every X is born Y" hook, rack-focus hook with a pull-back reveal as the signature move, light-burst bold moment.)

## Core Message (accuracy note)

Verified facts the script relies on (checked against the sources named in brackets):

- Flamingo chicks hatch with white or gray downy feathers and straight bills. It takes years for them to acquire the adult pink. (Smithsonian's National Zoo)
- The pink comes from carotenoids, pigments in the flamingos' food (algae, brine shrimp and other small crustaceans). The body processes them and they are deposited into newly growing feathers. (EarthSky, Discover Wildlife, ScienceABC)
- Both parents can produce "crop milk", a nutrient-rich secretion from the lining of the upper digestive tract, and feed it to the chick. It is not mammal milk. It is bright red or pink because it carries carotenoids from the parents' food. (Discover Wildlife, EarthSky, Smithsonian's National Zoo)
- A chick stays gray until it moves on to solid food, and it takes roughly two years or more to reach full adult color. (Los Angeles Zoo, Science ABC)
- Raising chicks can take a lot of carotenoid out of the parents' bodies (into eggs and crop milk), and parents can end up noticeably paler by the end of a breeding season. (Discover Wildlife)
- In zoos, flamingos are given food that contains carotenoids so they keep their color. (zoo reports; not used in the narration, useful for the description)
- Simplified or invented: the ranger character, the lagoon, the exact colors, the diagram of how pigments travel, and the compressed time-lapse. The video must not claim that the diagram shows real anatomy or real timing.

Wording rules for the script and captions:
- Do NOT say flamingos are pink "because of shrimp" alone. Say "algae and shrimp" (or "small algae and crustaceans").
- Do NOT call crop milk "blood". Say "bright red" and "milk" in quotes; the footnote says "Crop milk isn't mammal milk."
- Do NOT say parents "turn white". Say "can leave the parents paler".
- Do NOT give an exact number of days or years for the chick to turn pink beyond "a couple of years" (sources range from about two to three years).
- Do NOT imply every flamingo species has the same shade or the same diet.
- Never show or name a real product, logo, or interface. Never copy an existing cartoon character or mascot; the ranger is invented.
- Mark simplified parts with a small footnote: "Simplified illustration."

Key twist: **Flamingos aren't born pink. They're fed pink.**

---

# 🎨 Component Design

Design all on-screen UI components (info card, carotenoid chips, food-to-feather diagram arrows, before/after labels, caption pills, end-card elements) using the frontend-design skill, so they feel intentional and specific to this story rather than templated defaults.

Keep the series constants exactly as defined above.

Spend the visual boldness on one moment, the pull-back reveal in Scene 05: the parent feeds the chick a bright red-pink stream, soft sun rays burst out, and the camera pulls back from a close-up to reveal the whole colony at sunrise. Keep every other scene calm.

## Palette (this episode)

| Role | Hex | Used for |
|---|---|---|
| Sky top / bottom | #CFEFE3 → #FBE3C8 | Sunrise gradient |
| Far hills | #A9D5C6 | Distant hills, cooler and lighter |
| Water | #4FB0A8 | Lagoon |
| Shore sand | #F1D9B5 | Shoreline and nest mound |
| Reeds | #7DA24A | Mid and foreground plants |
| Flamingo pink / deep pink | #F58AA0 / #E4577A | Adults, crop milk, rays tint |
| Chick gray | #C9CED6 | Chick feathers |
| Ranger vest / hat / skin | #5E7F6B / #F2C14E / #F6D2B0 | Character |
| Ink (series constant) | #2B3A42 | Text and thin details |

## Layer Map

| Depth | Layer | Contents | Blur when not in focus |
|---|---|---|---|
| 0.00 | Sky | Sunrise gradient, small soft clouds, low sun | none (soft gradient) |
| 0.15 | Far scenery | Pale hills, a thin line of the far shore | light |
| 0.30 | Mid scenery | The lagoon, distant flock of adult flamingos | light |
| 0.50 | Subject plane | The ranger, nest mound and chick, parents (Scenes 05-06) | in focus |
| 0.70 | Near props | Mud nest mound edge, reed clusters | medium |
| 0.90 | Foreground | Large blurred reed blades and a few floating pollen dots, partly cropped | heavy |

## Camera Plan

| Scene | Move | From → To (zoom / focus) | Notes |
|---|---|---|---|
| 01 | Slow push-in with rack focus | zoom 1.10 → 1.25; focus 0.50 → 0.30 | Focus shifts from the ranger to the distant flock on "pink" |
| 02 | Lateral drift | x 0 → 120; zoom 1.2; focus 0.5 | Reveals the nest and chick |
| 03 | Gentle push-in | zoom 1.15 → 1.30; focus 0.30 | Focus stays on the lagoon layer with the food diagram |
| 04 | Small push-in | zoom 1.2 → 1.3; focus 0.5 | Calm; the diagram carries the scene |
| 05 | **Pull-back reveal** | zoom 2.4 → 1.0; y 120 → 0; focus 0.5 | The one bold move; sun rays fade in at the start of the pull-back |
| 06 | Lateral drift | x 0 → -80; zoom 1.2; focus 0.5 | Before/after of the parent |
| 07 | Tilt-up | y 0 → -140; zoom 1.15 | Rises to the flock at sunrise |
| 08 | Slow pull-back | zoom 1.2 → 1.0 | End card |

---

# 🎬 SCENE 01 — HOOK

**Suggested duration:** 0-5 seconds

## Purpose

Create instant curiosity: everyone knows flamingos are pink, so a "born gray" claim opens a gap.

## Codex Prompt

```text
Create a vertical 9:16 2.5D parallax flat-vector animation scene for a faceless YouTube Short, in a warm, friendly explainer style.

A calm lagoon at sunrise. Back to front: a soft peach-to-mint sky gradient with a low sun; pale blue-green hills far away, gently blurred; the lagoon in the middle distance with a flock of pink flamingos standing in the shallows, softly blurred at first; in the focal plane, a small cartoon wetland ranger seen from the side, wearing a round yellow bucket hat and a sage-green vest, holding binoculars and looking out over the water; in the foreground, a few large blurred reed blades at the edges and slow floating pollen dots.

The ranger breathes with a slight idle bob and blinks once. The camera pushes in slowly. Midway through, the focus shifts from the ranger to the flock, so the distant flamingos become sharp while the ranger softens.

Large bold rounded text appears in the upper third:

"Every flamingo is born gray."

Then below it:

"So where does the pink come from?"

The mood should be warm and curious. Flat vector shapes only, soft ground shadows, subtle paper grain.

No real people, no real brand logos, no existing cartoon characters, no photos or generated images, no heavy outlines, no scary imagery. Keep important elements inside the mobile safe area. 9:16 vertical.
```

## Voice-over

> Every flamingo is born gray...
> So where does the pink come from?

---

# 🥚 SCENE 02 — GRAY AT FIRST

**Suggested duration:** 5-11 seconds

## Purpose

Show the chick so the claim becomes concrete, and give the viewer a face to remember.

## Codex Prompt

```text
Create a vertical 9:16 2.5D parallax flat-vector animation scene continuing directly from the previous scene. Continue the exact same visual identity, characters and palette as the previous scene.

The camera drifts sideways along the shore to reveal a small mud nest mound in the focal plane. On top of it sits a fluffy gray-white flamingo chick with a short straight bill and long thin legs, blinking slowly. The ranger kneels beside the nest at a respectful distance and gestures gently toward the chick with one open hand. Behind them the lagoon and the pink flock stay softly blurred; a few large reed blades in the foreground sway slowly and stay blurred.

A translucent rounded info card slides in on the right side of the upper area, in the series info-card style:

Title: "NEWLY HATCHED"
Row: "Feathers: gray-white"
Row: "Bill: straight"
Row: "Pink: not yet"

The card fades out near the end of the scene.

The mood should be gentle and curious. Flat vector shapes, soft shadows, paper grain.

No real people, no real brand logos, no existing cartoon characters, no photos or generated images, no heavy outlines, no scary imagery. Keep important elements inside the mobile safe area. 9:16 vertical.
```

## Voice-over

> A newly hatched flamingo has soft, gray-white feathers...
> Pink is something it has to grow into.

---

# 🦐 SCENE 03 — IT'S IN THE FOOD

**Suggested duration:** 11-18 seconds

## Purpose

Introduce the source of the color: carotenoids in algae and small crustaceans.

## Codex Prompt

```text
Create a vertical 9:16 2.5D parallax flat-vector animation scene continuing directly from the previous scene. Continue the exact same visual identity, characters and palette as the previous scene.

The camera glides toward the lagoon surface while the ranger stays at the left edge, pointing at the water. In the focal plane, a cutaway of the shallow water in simple flat shapes: green algae strands, tiny round orange-pink shrimp, and a long-necked adult flamingo's head dipped upside down into the water, sieving food. Small glowing orange-pink dots (carotenoid chips) lift gently out of the algae and shrimp and float toward the flamingo's bill, while the background stays softly blurred.

Two small labels appear next to the food, in rounded text:

"algae + shrimp"

and then, as the dots float up:

"carotenoids = natural pigments"

A small footnote at the bottom, inside the safe area: "Simplified illustration."

The mood should be warm and curious. Flat vector shapes, soft shadows, paper grain.

No real people, no real brand logos, no existing cartoon characters, no photos or generated images, no heavy outlines, no scary imagery. Keep important elements inside the mobile safe area. 9:16 vertical.
```

## Voice-over

> The pink comes from food.
> Flamingos eat tiny algae and shrimp...
> packed with natural pigments called carotenoids.

---

# 🪶 SCENE 04 — FROM FOOD TO FEATHER

**Suggested duration:** 18-24 seconds

## Purpose

Explain the mechanism in the simplest possible diagram: food, body, feather.

## Codex Prompt

```text
Create a vertical 9:16 2.5D parallax flat-vector animation scene continuing directly from the previous scene. Continue the exact same visual identity, characters and palette as the previous scene.

A clean explainer diagram floats in front of a softly blurred lagoon background. From left to right (arranged top to bottom in the vertical frame for mobile): a small icon of algae and shrimp, an arrow to a simple flat flamingo silhouette in light gray, and an arrow to a close-up of a single feather. Orange-pink dots travel along the arrows. As the dots reach the feather, the feather's color shifts smoothly from soft gray to flamingo pink, growing from its base toward its tip.

Short labels in rounded text: "food", "body", "new feather".

The ranger stands at the lower left, nodding along. A small footnote near the bottom: "Simplified illustration."

The mood should be calm and clear. Flat vector shapes, soft shadows, paper grain.

No real people, no real brand logos, no existing cartoon characters, no photos or generated images, no heavy outlines, no scary imagery. Keep important elements inside the mobile safe area. 9:16 vertical.
```

## Voice-over

> Their bodies process those pigments...
> and deposit them into new feathers as they grow.

---

# ✨ SCENE 05 — THE BRIGHT RED "MILK" (BOLD MOMENT)

**Suggested duration:** 24-34 seconds

## Purpose

Deliver the surprising fact: parents of both sexes make a bright red "milk" that carries the pigments to the chick. This is the one bold moment of the episode.

## Codex Prompt

```text
Create a vertical 9:16 2.5D parallax flat-vector animation scene continuing directly from the previous scene. Continue the exact same visual identity, characters and palette as the previous scene.

Start with a close-up, camera zoomed in tightly: an adult pink flamingo bends its head down to the gray chick on the nest mound. A thin, glowing bright red-pink stream passes from the parent's bill to the chick's bill. The background is softly blurred; the foreground reed blades are heavily blurred and cropped at the edges.

Text appears in the upper third:

"But a chick can't filter-feed yet."

Then the camera pulls back in one smooth, eased move while soft golden sun rays fade in from the low sun and a gentle bloom surrounds the pair. As the camera pulls back, a second adult flamingo steps into the frame beside the first, and the view widens to the whole lagoon at sunrise, with the full flock glowing in warm light and the ranger small in the lower corner, smiling.

During the pull-back, a label appears:

"Both parents make bright red 'milk'"

And a small footnote: "Crop milk isn't mammal milk."

The mood should be wondrous but gentle. This is the only bold moment of the episode, so keep the light soft and warm, not harsh. Flat vector shapes, soft shadows, paper grain.

No real people, no real brand logos, no existing cartoon characters, no photos or generated images, no heavy outlines, no scary imagery, no blood imagery. Keep important elements inside the mobile safe area. 9:16 vertical.
```

## Voice-over

> But a chick can't filter-feed yet.
> So both parents make a bright red "milk"... in their throats.
> It carries the same pigments.

---

# 🍂 SCENE 06 — THE COST

**Suggested duration:** 34-39 seconds

## Purpose

Add the counterpoint that makes the story credible and gives the viewer a detail they probably have not heard.

## Codex Prompt

```text
Create a vertical 9:16 2.5D parallax flat-vector animation scene continuing directly from the previous scene. Continue the exact same visual identity, characters and palette as the previous scene.

The camera drifts slowly sideways. Two adult flamingos stand side by side in the focal plane on the shore, the chick between them. The left parent is shown in rich pink; as the camera drifts, a gentle color transition lightens the parent's feathers to a paler pink. Two small labels appear above the parent, in rounded text:

"Before"

and, after the color shifts:

"After raising a chick"

The ranger watches from the far right with the notebook open, softly blurred. Background lagoon and hills stay calm and blurred.

A small footnote: "Simplified illustration."

The mood should be gentle, with a touch of humor. Flat vector shapes, soft shadows, paper grain.

No real people, no real brand logos, no existing cartoon characters, no photos or generated images, no heavy outlines, no scary imagery. Keep important elements inside the mobile safe area. 9:16 vertical.
```

## Voice-over

> And it costs them...
> Raising chicks can leave the parents paler.

---

# 🌅 SCENE 07 — FED PINK

**Suggested duration:** 39-44 seconds

## Purpose

Land the twist line and resolve the hook.

## Codex Prompt

```text
Create a vertical 9:16 2.5D parallax flat-vector animation scene continuing directly from the previous scene. Continue the exact same visual identity, characters and palette as the previous scene.

A gentle time-lapse on the shore: the gray chick in the focal plane grows into a young bird and then a fully pink adult, its color warming from gray to pink in smooth steps. A small label appears briefly: "A couple of years later". The ranger waves goodbye in the corner.

The camera tilts upward to rise over the pink flock standing in the glowing lagoon at sunrise, while the foreground reeds slide past slowly.

Large bold rounded text appears near the center as the camera rises:

"Born gray. Fed pink."

A small footnote: "Simplified illustration."

The mood should be warm and satisfied. Flat vector shapes, soft shadows, paper grain.

No real people, no real brand logos, no existing cartoon characters, no photos or generated images, no heavy outlines, no scary imagery. Keep important elements inside the mobile safe area. 9:16 vertical.
```

## Voice-over

> So a flamingo isn't born pink...
> it's fed pink.

---

# 🖥️ SCENE 08 — END CARD

**Suggested duration:** 44-48 seconds

## Purpose

Create a memorable branded ending that sets the Everyday Why constants.

## Codex Prompt

```text
Create a vertical 9:16 2.5D parallax flat-vector animation end card, continuing the exact same visual identity as the previous scenes.

A warm sunburst gradient fills the background, from soft peach at the center to pale mint at the edges, with a very subtle paper grain. In the center, large bold rounded text:

"Flamingos aren't born pink. They're fed pink."

Below it, a small flat illustration of a gray chick next to a pink adult flamingo, gently bobbing. At the bottom, inside the safe area, small text: "Everyday Why #01" and "Follow for #02".

The camera performs a slow, gentle pull-back, and a few soft light rays rotate very slowly behind the text.

The mood should be warm and confident. Flat vector shapes only.

No real people, no real brand logos, no existing cartoon characters, no photos or generated images, no heavy outlines. Keep text inside the mobile safe area. 9:16 vertical.
```

## Voice-over

No voice-over is required for the end card.

Optional ending sound design:
- soft rising chime
- gentle air whoosh
- short warm pop

Optional small text near the bottom (inside safe area): "Follow for #02"

---

# 🎙️ Full English Voice-over

Use this as the master narration for the complete episode:

> Every flamingo is born gray...
> So where does the pink come from?
>
> A newly hatched flamingo has soft, gray-white feathers...
> Pink is something it has to grow into.
>
> The pink comes from food.
> Flamingos eat tiny algae and shrimp...
> packed with natural pigments called carotenoids.
>
> Their bodies process those pigments...
> and deposit them into new feathers as they grow.
>
> But a chick can't filter-feed yet.
> So both parents make a bright red "milk"... in their throats.
> It carries the same pigments.
>
> And it costs them...
> Raising chicks can leave the parents paler.
>
> So a flamingo isn't born pink...
> it's fed pink.

Approx. 101 words, about 42-46 seconds with pauses.

---

# 🎞️ Recommended Final Structure

```text
SCENE 01 — HOOK
0:00–0:05
"Every flamingo is born gray... So where does the pink come from?"

        ↓

SCENE 02 — GRAY AT FIRST
0:05–0:11
"A newly hatched flamingo has soft, gray-white feathers..."

        ↓

SCENE 03 — IT'S IN THE FOOD
0:11–0:18
"The pink comes from food."

        ↓

SCENE 04 — FROM FOOD TO FEATHER
0:18–0:24
"Their bodies process those pigments..."

        ↓

SCENE 05 — THE BRIGHT RED "MILK" (BOLD MOMENT)
0:24–0:34
"So both parents make a bright red "milk"..."

        ↓

SCENE 06 — THE COST
0:34–0:39
"Raising chicks can leave the parents paler."

        ↓

SCENE 07 — FED PINK
0:39–0:44
"It's fed pink."

        ↓

SCENE 08 — END CARD
0:44–0:48
"Flamingos aren't born pink. They're fed pink."
```

---

# 🎨 Global Visual Rules

- Vertical 9:16
- Bright, warm, flat-vector look: no outlines, soft elliptical ground shadows, subtle paper grain
- 2.5D parallax: separate depth layers that move at different speeds with the camera
- Soft depth-of-field blur on near and far layers; the subject plane stays sharp
- Simple cartoon characters built from basic shapes, with small expressive motion (blink, bob, point)
- One rounded sans-serif typeface family
- Limited palette (about 8 colors plus ink)
- Warm light and sun rays reserved for Scene 05
- Plenty of negative space; one idea per scene
- No real people, no photos, no generated images: every visual is drawn with code
- No existing cartoon characters or channel mascots
- No scary, graphic, or alarming effects (the "milk" is bright red-pink and drawn as a soft glowing stream, never as blood)
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

Performance: keep each scene to about 8 layers and at most 3 blurred layers on screen at once. The far hills and sky can be blurred once and reused. Avoid full-screen SVG filters.

Implementation tip: keep the timing and the color keyframes in one data file so the scenes stay consistent. For example, `episode.data.ts` holds the scene start and duration in frames at 30 fps (Scene 01 starts at 0 and lasts 150 frames; Scene 02 starts at 150 and lasts 180; Scene 03 starts at 330 and lasts 210; Scene 04 starts at 540 and lasts 180; Scene 05 starts at 720 and lasts 300; Scene 06 starts at 1020 and lasts 150; Scene 07 starts at 1170 and lasts 150; Scene 08 starts at 1320 and lasts 120), the camera keys for each scene, and the feather color keyframes (chick gray `#C9CED6` to adult pink `#F58AA0`, parent pink `#F58AA0` to paler `#F8B9C6`). The ranger and flamingo rigs should be reusable components in `src/characters/`, so later episodes can reuse the engine and swap in new characters and scenery.

This separation makes each scene easier to replace or regenerate without rebuilding the entire video.
