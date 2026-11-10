# Remotion recipe — building the 2.5D parallax style

Use this when the user asks how the style is built, or when you write the "Production Note" and "Implementation tip" of an episode file. The snippets are starting points written against Remotion's standard API (`useCurrentFrame`, `useVideoConfig`, `interpolate`, `interpolateColors`, `Easing`, `AbsoluteFill`). They were not run in this environment, so Codex should adapt them and test the render.

Composition: 1080×1920, 30 fps. Remotion is the compositor and renderer; the illustrations themselves are SVG drawn by Codex (or exported from a vector tool and imported as SVG).

## 1. Principle

A scene is a stack of full-frame layers. A virtual camera (x, y, zoom, focus depth) is shared through React context. Every layer reads the camera and applies its own parallax factor, scale, and blur based on its depth. The camera is animated with keyframes, so the whole scene moves coherently and layers slide past each other.

## 2. Camera and depth layers

```tsx
// camera.tsx
import React, {createContext, useContext} from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';

export type CameraKey = {frame: number; x: number; y: number; zoom: number; focus: number};
type CameraState = Omit<CameraKey, 'frame'>;

const CameraContext = createContext<CameraState>({x: 0, y: 0, zoom: 1, focus: 0.5});
export const useCamera = () => useContext(CameraContext);

// keys needs at least two entries, with strictly increasing frame numbers.
export const Camera: React.FC<{keys: CameraKey[]; children: React.ReactNode}> = ({keys, children}) => {
  const frame = useCurrentFrame();
  const frames = keys.map((k) => k.frame);
  const opts = {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp' as const,
    extrapolateRight: 'clamp' as const,
  };
  const state: CameraState = {
    x: interpolate(frame, frames, keys.map((k) => k.x), opts),
    y: interpolate(frame, frames, keys.map((k) => k.y), opts),
    zoom: interpolate(frame, frames, keys.map((k) => k.zoom), opts),
    focus: interpolate(frame, frames, keys.map((k) => k.focus), opts),
  };
  return (
    <CameraContext.Provider value={state}>
      <AbsoluteFill style={{overflow: 'hidden'}}>{children}</AbsoluteFill>
    </CameraContext.Provider>
  );
};

// depth: 0 = far (sky) ... 1 = near (foreground)
export const DepthLayer: React.FC<{depth: number; maxBlur?: number; children: React.ReactNode}> = ({
  depth,
  maxBlur = 12,
  children,
}) => {
  const cam = useCamera();
  const factor = 0.2 + 0.8 * depth; // far layers move and scale less than near ones
  const scale = 1 + (cam.zoom - 1) * factor;
  const tx = -cam.x * factor;
  const ty = -cam.y * factor;
  const blur = Math.abs(depth - cam.focus) * 2 * maxBlur; // 0 at the focal depth
  return (
    <AbsoluteFill
      style={{
        transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        filter: blur > 0.5 ? `blur(${blur}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
```

Usage for a pull-back reveal that also racks the focus from the character to the whole scene:

```tsx
<Camera
  keys={[
    {frame: 0,   x: 0, y: 120, zoom: 2.4, focus: 0.5},
    {frame: 90,  x: 0, y: 0,   zoom: 1.0, focus: 0.5},
  ]}
>
  <DepthLayer depth={0.0}><Sky /></DepthLayer>
  <DepthLayer depth={0.15}><FarHills /></DepthLayer>
  <DepthLayer depth={0.3}><Lagoon /></DepthLayer>
  <DepthLayer depth={0.5}><Ranger pose="point" /></DepthLayer>
  <DepthLayer depth={0.9}><ForegroundReeds /></DepthLayer>
</Camera>
```

Notes:
- Layers scale around the frame center. Offset `x` and `y` so the subject stays in frame during zooms, and position the subject's own SVG accordingly.
- Each layer component should draw its content larger than the frame (about 15 percent bleed) so edges never show during zooms and drifts.
- A tilt-up reveal is a change in `y` with a small zoom change.

## 3. Character rig (shapes + idle motion)

```tsx
// ranger.tsx (sketch: draw the real character from circles, rounded rects and capsules)
import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';

export const Ranger: React.FC<{pose?: 'idle' | 'point'}> = ({pose = 'idle'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  const bob = Math.sin(t * Math.PI * 2 * 0.8) * 4;     // gentle breathing bob
  const sinceBlink = t % 3.2;                           // blink every 3.2 s
  const eyeRy = sinceBlink > 3.1 ? 1 : 9;               // squash the eyes briefly
  const armAngle = pose === 'point' ? -55 : 8;          // rotate the arm at the shoulder

  return (
    <svg viewBox="0 0 400 700" width={400} height={700}>
      <ellipse cx={200} cy={660} rx={110} ry={20} fill="#2B3A42" opacity={0.15} />
      <g transform={`translate(0 ${bob})`}>
        <rect x={140} y={300} width={120} height={260} rx={50} fill="#5E7F6B" />   {/* body */}
        <g transform={`rotate(${armAngle} 262 330)`}>
          <rect x={250} y={320} width={34} height={150} rx={17} fill="#5E7F6B" />  {/* arm */}
        </g>
        <circle cx={200} cy={220} r={85} fill="#F6D2B0" />                          {/* head */}
        <path d="M110 205 A90 80 0 0 1 290 205 Z" fill="#F2C14E" />                 {/* hat */}
        <ellipse cx={170} cy={235} rx={7} ry={eyeRy} fill="#2B3A42" />
        <ellipse cx={230} cy={235} rx={7} ry={eyeRy} fill="#2B3A42" />
      </g>
    </svg>
  );
};
```

For groups (a flock, a herd), render the same component several times with different scale, color, and a per-instance time offset so idle motion is not synchronized. Remotion's `random(seed)` gives stable pseudo-random values per instance.

## 4. Color and liquid transitions

A color that changes over time (for example a feather, a leaf, a cooked food):

```tsx
import {Easing, interpolate, interpolateColors, useCurrentFrame} from 'remotion';

const frame = useCurrentFrame();
const progress = interpolate(frame, [start, end], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
  easing: Easing.out(Easing.quad),
});
const featherColor = interpolateColors(progress, [0, 1], ['#CBD0D8', '#F58AA0']);
```

A liquid rising inside a container, with a gently moving surface (the container shape is a `<clipPath>` defined elsewhere in the same SVG):

```tsx
const LiquidFill: React.FC<{x: number; y: number; w: number; h: number; level: number; color: string; clipId: string}> = ({
  x, y, w, h, level, color, clipId,
}) => {
  const frame = useCurrentFrame();
  const top = y + h * (1 - level);
  const points = Array.from({length: 17}, (_, i) => {
    const px = x + (w / 16) * i;
    const py = top + Math.sin(frame / 8 + i * 0.9) * 5;
    return `${i === 0 ? 'M' : 'L'}${px},${py}`;
  }).join(' ');
  return (
    <g clipPath={`url(#${clipId})`}>
      <path d={`${points} L${x + w},${y + h} L${x},${y + h} Z`} fill={color} />
    </g>
  );
};
```

A pouring stream: an animated rounded rectangle whose height grows with `interpolate`, with a slow horizontal sine wobble on its edges. Keep SVG filters (`feTurbulence`, `feDisplacementMap`) for small elements only; on a full-screen layer they are slow to render.

## 5. Sun rays (the bold moment)

```tsx
const SunRays: React.FC<{x: number; y: number; opacity: number}> = ({x, y, opacity}) => {
  const frame = useCurrentFrame();
  const sway = Math.sin(frame / 60) * 3;
  const angles = [-50, -30, -10, 10, 30, 50];
  return (
    <AbsoluteFill style={{opacity, mixBlendMode: 'screen', pointerEvents: 'none'}}>
      {angles.map((a, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: x - 70,
            top: y,
            width: 140,
            height: 2600,
            transformOrigin: '50% 0',
            transform: `rotate(${a + (i % 2 ? sway : -sway)}deg)`,
            background: 'linear-gradient(to bottom, rgba(255,246,214,0.9), rgba(255,246,214,0))',
            filter: 'blur(6px)',
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
```

Fade the rays in with `interpolate` on the frame of the bold moment and fade them out before the next scene. Add a soft radial gradient at the light source for the glow.

## 6. Grain, vignette, captions

- **Grain:** generate one small tiling noise PNG once (a short script), put it in `public/`, and overlay it with `staticFile` at a few percent opacity. Do not generate noise with a full-screen SVG filter at render time.
- **Vignette:** one full-frame radial gradient at low opacity on top of the scene.
- **Captions:** word-level timestamps from ElevenLabs go into a data file; a caption component shows a few words at a time, and highlights the current word.
- **Fonts:** load the series typeface through `@remotion/google-fonts` and keep the family fixed across episodes.

## 7. Performance

Blurred full-screen layers are the main cost in Chrome-based rendering. To keep renders short:
- At most about 8 layers per scene, and at most 3 blurred layers on screen at once.
- Layers that stay out of focus for the whole scene can be blurred once and reused: render the SVG to a PNG with the blur baked in, then draw it as an image. If a rack focus changes which layer is sharp, crossfade between a sharp and a baked-blurred version of that layer.
- Prefer transforms and opacity for motion. Avoid animating large SVG filters or `box-shadow`.
- Split the video into one composition per scene during development, render and review scenes separately, then assemble the final composition.
- Tune `--concurrency` for the render machine, and preview at half resolution before the final 1080×1920 render.

## 8. Data file and structure

Keep timing and content in one data file so scenes stay consistent and are easy to retime when the voice-over changes:

```ts
// episode.data.ts
export const fps = 30;
export const scenes = [
  {id: 'hook',   from: 0,   duration: 150, camera: [/* CameraKey[] */]},
  {id: 'setup',  from: 150, duration: 210, camera: [/* ... */]},
  // ...
];
export const words = [/* {text, startMs, endMs} from the ElevenLabs timestamps */];
```

Suggested folder layout: `src/engine/` (Camera, DepthLayer, SunRays, Grain, Captions), `src/characters/`, `src/scenery/<episode>/`, `src/episodes/<episode>/Scene01.tsx ...`. The engine and character rigs are reused across episodes; scenery and palette change every episode, which is also what keeps the series varied.
