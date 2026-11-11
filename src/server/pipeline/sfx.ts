/** Small original PCM cues generated locally; no external assets or API calls. */
export const SFX_FILES = { whoosh: 'sfx-whoosh.wav', pop: 'sfx-pop.wav', tap: 'sfx-tap.wav' } as const;
export type SoundEffect = keyof typeof SFX_FILES;
export function synthesizeSfx(kind: SoundEffect): Buffer {
  const rate = 44100;
  const duration = { whoosh: 0.28, pop: 0.12, tap: 0.08 }[kind];
  const samples = Math.round(duration * rate);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  let seed = 47291, filtered = 0;
  for (let i = 0; i < samples; i++) {
    const time = i / rate, progress = i / (samples - 1);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 4294967296 * 2 - 1;
    filtered += (noise - filtered) * 0.14;
    const envelope = Math.sin(Math.PI * progress) ** 2;
    const value = kind === 'whoosh' ? filtered * envelope * 0.9 : kind === 'pop' ? Math.sin(2 * Math.PI * (630 * time - 1700 * time * time)) * envelope * Math.exp(-progress * 3) * 0.6 : (Math.sin(2 * Math.PI * 950 * time) * 0.4 + noise * 0.12) * envelope * Math.exp(-progress * 5);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2);
  }
  return wav;
}
