# Style bible — 2.5D parallax flat-vector explainer

The look this series aims for: flat vector illustration with no outlines, drawn in layers, with a virtual camera that pushes in and pulls back so the layers slide past each other at different speeds. Foreground and background layers are softly blurred while the subject stays sharp. Characters are simple and friendly. Light (sun rays, glow) is saved for the big reveal.

It is inspired by the explainer-animation genre (layered 2D scenery, cutout characters, parallax camera). Use it as a *style* reference only. Never copy another channel's characters, mascots, logos, or scenes.

Everything must be drawable by code (SVG, CSS, Remotion transforms). Do not ask Codex for photos, stock footage, or generated images.

## 1. Series constants vs episode variables

| Constant (never changes) | Variable (changes every episode) |
|---|---|
| Flat vector, no outlines | Setting and palette family |
| Soft elliptical ground shadows | Main character design and role |
| Subtle paper grain overlay | Hook formula |
| One rounded sans-serif family | Primary camera move |
| Caption style | Type of bold moment |
| Info-card style | Props and background details |
| End-card layout | |

## 2. Palette rules

- Each episode uses about 6-8 flat colors plus one ink color for text. Ink is a constant dark blue-gray (for example `#2B3A42`); everything else is chosen from the episode's palette family.
- Build the palette in three groups: **backdrop** (sky, far hills, distant walls: desaturated, lighter), **middle** (the setting: medium saturation), **subject** (the character and the thing being explained: the most saturated colors on screen).
- Far layers get lighter and cooler with distance (atmospheric perspective). Near layers get slightly darker and warmer.
- Palette families to rotate through: lagoon sunrise (peach, mint, teal), kitchen interior (cream, terracotta, sage), night sky (indigo, violet, warm yellow accents), desert noon (sand, coral, sky blue), forest morning (olive, moss, amber), harbor dusk (slate blue, orange, rose). Do not use the same family two episodes in a row.
- No pure black. No neon. No red or warning colors unless the topic truly calls for it.
- Keep text contrast high: dark ink on light cards, white on dark pills.

## 3. Depth layers

Depth is a number from 0 (infinitely far) to 1 (closest to the camera). It controls how fast a layer moves with the camera, how much it scales during zooms, and how blurred it is when out of focus.

| Depth | Layer | Typical contents |
|---|---|---|
| 0.00 | Sky | Gradient, soft clouds, sun or moon |
| 0.15 | Far scenery | Mountains, skyline, distant trees |
| 0.30 | Mid scenery | Buildings, fences, main trees, the large setting |
| 0.50 | Subject plane | The character and the thing being explained; **the default focal plane** |
| 0.70 | Near props | Crates, plants, animals close to the subject |
| 0.90 | Foreground | Large blurred leaves, flowers, edges of objects, partly cropped |

Rules:
- The subject plane (0.5) is sharp unless a rack focus moves the focus elsewhere.
- Blur grows with distance from the focus depth. Typical maximum blur is about 8-14 px at 1080×1920 for the farthest layers and the foreground.
- Use at most about 8 layers per scene and at most 3 blurred layers at once.
- In a vertical 9:16 frame, stack the world vertically: sky at the top, scenery in the upper-middle, the subject in the lower-middle, foreground at the bottom. Do not simply crop a horizontal landscape.

## 4. Characters

Characters are built from simple shapes so Codex can draw them as SVG and animate the parts.

**Construction**
- Head: a circle. Body: a rounded rectangle or a trapezoid. Limbs: capsules (thick rounded lines). Hands and feet: small circles or ellipses.
- Face: two small dark ovals for eyes; a small curve for a mouth; no nose, or a tiny shape. Blinks are a quick vertical squash of the eyes.
- A hat, cap, hair shape, or headband gives each character a recognizable silhouette. Change this every episode.
- Fill colors only: skin tone, outfit (two colors), accessory, and a single darker tone for shading shapes. No outlines, no gradients on the body (gradients are allowed on backgrounds and light effects).
- A soft ellipse under the feet is the ground shadow.

**Poses and motion**
- Each character has 3-4 pose variants (idle, pointing, surprised, holding something). Swap poses at beat changes.
- Always-on idle motion: a slow breathing bob (a few pixels, around 0.8 Hz) and an occasional blink every 2-4 seconds.
- Group scenes (a flock, a herd, a crowd): duplicate the same shapes with small differences in scale, color, and idle phase so they do not move in sync.

**Animals and objects**
- Same rules: simplified silhouettes with two or three markings, no outlines, ground shadow.
- Show anatomy or mechanisms as simplified cutaways or diagrams with arrows, never as realistic renderings. Label them "Simplified illustration."

## 5. Camera moves

The camera is virtual: it has x, y, zoom, and a focus depth, animated with easing (ease-in-out cubic is the default).

| Move | What it does | Use for |
|---|---|---|
| Push-in | Slow zoom toward the subject (for example 1.1 → 1.3 over a scene) | Hook, emphasis |
| Pull-back reveal | Zoom out (for example 2.4 → 1.0) so the viewer sees where the subject lives | The bold moment, scale or context reveals |
| Tilt-up reveal | Camera moves upward to reveal what is above or beyond; the vertical equivalent of a landscape pan | Vertical 9:16 reveals |
| Lateral drift | Slow sideways travel; layers slide at different speeds | Transitions, "meanwhile" beats |
| Rack focus | Focus depth shifts from one layer to another; blur follows | Directing attention to a detail |

Rules:
- One primary camera move per episode as the signature; secondary moves are small.
- Never whip or shake the camera; it reads as noisy on a phone.
- Moves start and end with easing; hold still for a beat on each key line.

## 6. Light and atmosphere

- **Sun rays and glow** are reserved for the bold moment: a few soft translucent wedges from a light source, a bright core, and a slight bloom. Use screen-style blending and low opacity.
- **Vignette**: a very subtle darkening at the corners on every scene.
- **Grain**: a faint paper-grain overlay (a few percent opacity) that is part of the series constants.
- **Floating particles** (pollen, dust, bubbles) are allowed in small numbers, in the foreground layers, to make depth obvious.
- No lens flares, no heavy bloom, no color-grading filters that change between scenes.

## 7. Info card (the labeled-card infographic)

A translucent, rounded panel that floats in the scene to present a fact, a "profile", or a labeled diagram.

- Rounded rectangle, white or pale-tinted fill at about 75-85 percent opacity, soft shadow.
- A bold uppercase title in the series typeface, then two to four key-value rows ("Name: ...", "Where: ...").
- Remaining detail is suggested by gray rounded bars as placeholder text lines, which keeps the card readable without small print.
- A small flat icon or illustration in a rounded square at one side.
- Enters with a gentle slide and fade, leaves the same way. Never more than one card on screen.

## 8. Typography and captions

- One rounded sans-serif family for the whole series (chosen once on episode #01 and kept; Remotion can load it through `@remotion/google-fonts`). Weights: bold for titles and captions, regular for card rows.
- Word-level captions from the ElevenLabs timestamps, a few words at a time, large, bold, white with a soft dark shadow or on a dark rounded pill. The caption position is a series constant.
- On-screen quotes in the Codex prompts must be exact; Remotion handles the final pixel-perfect text.

## 9. Mobile safe area (9:16)

- Keep the subject and all text between roughly 10 percent and 75 percent of the frame height, and leave about 12 percent free on the right edge. Shorts and TikTok draw the title, buttons, and captions over the bottom and right of the frame.
- Layouts change between apps and updates, so tell the user to preview an upload in the app before relying on exact margins.
- Backgrounds and foreground layers may fill the whole frame; only important content must stay inside the safe area.

## 10. Sound

- Voice-over (ElevenLabs) first; music very quiet under it (calm, acoustic or soft synth, no lyrics).
- Light sound design on key beats: soft whooshes for camera moves, a gentle pop for card entrances, a warm chime for the bold moment.
- The end card may have a short chime and no voice-over.
