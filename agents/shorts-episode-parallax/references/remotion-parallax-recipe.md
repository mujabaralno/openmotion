# Remotion recipe: building the 2.5D parallax style

Use this when you build an episode, or when you write the production notes of an episode file. The code is **not pasted here any more**: it lives in `engine-starter/` (type-checked, see section 12). Copy it into the video repo once and reuse it in every episode. Do not rewrite the engine per episode; that is the main reason results differed between agents and between episodes.

Contents: 1 Principle · 2 The engine · 3 Episode wiring · 4 Word timestamps · 5 Scene skeleton · 6 Characters · 7 Color, liquid, travelling dots · 8 The bold moment · 9 Kinetic typography · 10 Audio and SFX · 11 The verify loop · 12 Performance · 13 What was tested

Composition: 1080x1920, 30 fps. Remotion is the compositor and renderer; the illustrations are SVG drawn by code.

## 1. Principle

A scene is a stack of full-frame layers. A virtual camera (x, y, zoom, focus depth) is shared through React context. Every layer reads the camera and applies its own parallax factor, scale and blur from its depth. The camera is animated with keyframes, so the scene moves coherently and layers slide past each other.

## 2. The engine (`src/engine/`)

| File | Exports | Use |
|---|---|---|
| `camera.tsx` | `Camera`, `DepthLayer`, `useCamera` | `<Camera keys=[{frame,x,y,zoom,focus},...]>` wraps the scene; `<DepthLayer depth={0..1}>` per layer. Keys use scene-local frames, strictly increasing, at least two |
| `motion.tsx` | `SPRINGS`, `useIdle`, `useBlink`, `useEnter` | Idle bob and sway, blinking, spring entrances (`pop`, `soft`, `snappy`) |
| `kinetic.tsx` | `KineticLine` | One phrase, word by word, driven by voice-over timestamps; emphasis words; exit |
| `transitions.tsx` | `SceneShell` | Per-scene enter and exit (`fade`, `slide-up`, `slide-left`) with overlap |
| `overlays.tsx` | `SAFE`, `Watermark`, `Grain`, `Vignette`, `SunRays`, `SafeAreaDebug` | Series-wide overlays and the safe-area numbers |
| `audio.tsx` | `MasterAudio`, `SfxCue` | One voice-over for the whole episode, music, sound effects at absolute frames |
| `timeline.ts` | `alignWords`, `sceneFrames`, `msToFrame`, types | Word timing and scene boundaries from the voice-over |
| `fx.tsx` | `useColorShift`, `LiquidFill`, `TravelDot` | Color changes over time, liquid levels, dots travelling along a curve |
| `fonts.ts` | `FONT` | The series typeface (Nunito via `@remotion/google-fonts`); choose once on the first episode and keep it |

## 3. Episode wiring

Timing flows one way, from the audio to the video:

```text
SCRIPT (known text)  +  voiceover.words.json (timestamps)
        -> alignWords -> WORDS (script text, real timing)
ANCHORS (first word of each scene)
        -> sceneFrames -> TIMING.scenes[k].{from,duration}, TIMING.endCard, TOTAL
Episode.tsx lays the scenes out in overlapped <Sequence>s
```

- `episode.data.ts` holds `FPS`, `SCRIPT`, `WORDS`, `ANCHORS`, `TIMING`, `TOTAL` and `SFX`. Nothing else in the episode hardcodes a scene length or a text time. Re-recording the voice-over only means replacing the two audio files.
- Scene k starts `OVERLAP` (14) frames earlier than `TIMING.scenes[k].from`, so scene-local frame 0 is the first frame of the overlap, and the scene's first spoken word is about 14 + 7 frames in. Pass the real Sequence start as `sceneStartFrame` to `KineticLine`; the demo shows how.
- `SFX` entries use **absolute** frames (`TIMING.scenes[k].from - 14` for a transition whoosh). `SfxCue` is rendered in `Episode.tsx`, never inside a scene Sequence.
- The watermark, vignette and grain are rendered once in `Episode.tsx`, above all scenes.

## 4. Word timestamps

`public/audio/voiceover.words.json` must be `[{"text": "...", "startMs": 0, "endMs": 0}, ...]`.

- **A. The voice tool provides timestamps.** Convert to the format above.
- **B. It does not (the Voicebox default is unknown: check).** Transcribe the finished mp3 with speech recognition and convert the result. Two routes, **not tested in this environment**, so confirm against the current documentation: `@remotion/install-whisper-cpp` (Remotion's whisper.cpp wrapper; use `language: 'id'` and a larger model for Indonesian; token-level output must be merged into words), or a Python tool that returns word-level times (for example whisper-timestamped or WhisperX).
- **Always pass the result through `alignWords(SCRIPT, asrWords)`.** Recognition makes spelling mistakes in Indonesian names and loanwords; `alignWords` keeps the spelling of the known script and takes only the timing. Print the aligned list once and check three spots by ear.
- If no timestamps can be produced at all, stop and ask; do not guess timings, because the kinetic typography then drifts away from the voice.

## 5. Scene skeleton

```tsx
export const SceneNN: React.FC<{from: number; duration: number}> = ({from, duration}) => (
  <SceneShell durationInFrames={duration} enter="fade" exit="slide-up">
    <Camera keys={[{frame: 0, x: 0, y: 0, zoom: 1.1, focus: 0.5}, {frame: duration, x: 0, y: -60, zoom: 1.3, focus: 0.5}]}>
      <DepthLayer depth={0}><Sky /></DepthLayer>
      <DepthLayer depth={0.5}><Ranger /></DepthLayer>
    </Camera>
    <div style={{position: 'absolute', left: SAFE.left, right: SAFE.right, top: 300}}>
      <KineticLine words={WORDS.slice(0, 5)} sceneStartFrame={from} emphasis={[4]} fontFamily={FONT} />
    </div>
  </SceneShell>
);
```

Notes: draw each layer larger than the frame (about 15 percent bleed) so edges never show during zooms and drifts. Layers scale around the frame center, so position the subject's own SVG accordingly. A tilt-up reveal is a change in `y` with a small zoom change.

## 6. Characters

- Build from circles, rounded rectangles and capsules (see `src/characters/Ranger.tsx`, a sketch). Idle: `useIdle` for the bob and `useBlink` for the eyes. Poses change through eased tweens of 6-10 frames.
- Groups (a flock, a crowd): render the same component many times with different scale, color and `phase`. Remotion's `random(seed)` gives stable pseudo-random values per instance, so renders are repeatable.
- Change silhouette, proportions and outfit every episode (style bible, section 5).

## 7. Color, liquid, travelling dots

- Color over time: `useColorShift(from, to, startFrame, endFrame)`; for a color that grows from the base of a feather to its tip, animate a clip or gradient mask with `interpolate`.
- Liquid rising in a container: `<LiquidFill ... clipId>` inside an `<svg>` that defines the container as a `<clipPath>`. A pouring stream is an animated rounded rectangle whose height grows with `interpolate`, with a slow sine wobble on its edges.
- Particles or "pigment" travelling along a path: `<TravelDot from via to period delay>`; several instances with different `delay` values look like a flow.
- SVG filters (`feTurbulence`, `feDisplacementMap`) only on small elements; on a full-screen layer they are slow.

## 8. The bold moment

One scene per episode may use sun rays, a riser and a large camera move.

- `<SunRays x y opacity>`: fade the opacity in with `interpolate` from the frame of the reveal, up to about 0.55, and fade out before the exit. Add a soft radial gradient at the light source for the glow.
- Camera: hold tight (zoom about 2.4) until the reveal word, then one eased pull-back (zoom to 1.0) over 120-180 frames. No shake.
- Sound: riser ending at the reveal (start it 36 frames earlier), chime on the reveal.

## 9. Kinetic typography

`<KineticLine words sceneStartFrame emphasis fontFamily fontSize holdFrames />`

- `words`: a slice of `WORDS` for ONE phrase (2-6 words). `emphasis`: indices inside that slice (1-2).
- `holdFrames` defaults to 20. Use a small value (4) when the next phrase starts soon, so two phrases never share the screen.
- Position is chosen by the scene (upper band y 192-600, or lower-middle band y 1000-1300); the component only lays out the words. Keep width at most 896 px (`1080 - SAFE.left - SAFE.right`).
- Sizes and rules: style bible, section 9.

## 10. Audio and SFX

- `<MasterAudio totalFrames>`: one `voiceover.mp3` for the whole episode, never split per scene. Optional `music` at volume 0.08-0.12 with fades.
- `<SfxCue at src volume frames>` at absolute frames. Sounds: `whoosh`, `pop`, `tick`, `chime`, `riser` in `public/sfx/`. `node scripts/make-assets.mjs` generates simple placeholders (synthesized, dependency-free) so the project always has sounds; replace them with better ones whenever you have them.
- The map of moments, volumes and limits is in style bible section 14.

## 11. The verify loop

A video that was never looked at is usually wrong somewhere. After each scene, and again at the end:

1. Render stills: `npx remotion still src/index.ts Episode out/name.png --frame=<absolute frame>`. Pick: the scene's first frame, the middle, the last frame, the emphasized word of each phrase, and the middle of each transition.
2. Add `<SafeAreaDebug/>` temporarily and look for text or key shapes outside the dashed box.
3. Compare two stills 20 frames apart: at least three things must have moved.
4. Preview at half scale while iterating (`--scale=0.5`); render the final at full size: `npx remotion render src/index.ts Episode out/<slug>.mp4 --codec h264`.
5. Tune `--concurrency` for the machine if the render is slow.

## 12. Performance

Blurred full-screen layers are the main cost in browser-based rendering.

- At most about 8 layers per scene and 3 blurred layers on screen at once.
- A layer that stays out of focus the whole scene can be blurred once and reused: render the SVG to a PNG with the blur baked in and draw it as an image. If a rack focus changes which layer is sharp, crossfade between a sharp and a baked-blurred version.
- Prefer transforms and opacity for motion. Avoid animating large SVG filters or `box-shadow`.
- During development use one composition per scene, review scenes separately, then assemble.

## 13. What was tested

- Type-checked with `tsc --noEmit` (TypeScript 7.0.2) against remotion 4.0.542 and react 19.3.1: every file in `engine-starter/`, including the demo episode wiring.
- `alignWords` and `sceneFrames` were run on sample data with deliberate recognition errors (a split word, a dropped word, a word spelled differently): the output had the right length and non-decreasing times.
- `scripts/make-assets.mjs` was run; the five WAV files and the PNG were opened and read back correctly.
- **Not tested:** rendering. No browser was available, so no still or video was rendered. The first `npx remotion still` on a new machine is the real test; fix what it shows, and keep the fix in the engine, not in the episode.