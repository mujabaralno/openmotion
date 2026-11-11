import assert from 'node:assert/strict';
import test from 'node:test';
import { SFX_FILES, synthesizeSfx } from '../src/server/pipeline/sfx.ts';
test('built-in cues are deterministic non-silent PCM WAV with short faded boundaries', () => {
  for (const kind of Object.keys(SFX_FILES) as (keyof typeof SFX_FILES)[]) {
    const wav = synthesizeSfx(kind);
    assert.deepEqual(wav, synthesizeSfx(kind));
    assert.equal(wav.toString('ascii',0,4),'RIFF');
    assert.equal(wav.toString('ascii',8,12),'WAVE');
    assert.equal(wav.readUInt32LE(4),wav.length-8);
    assert.equal(wav.readUInt32LE(40),wav.length-44);
    assert.equal(wav.readUInt32LE(24),44100);
    assert.equal(wav.readUInt16LE(22),1);
    assert.equal(wav.readInt16LE(44),0);
    assert.equal(wav.readInt16LE(wav.length-2),0);
    assert.ok(wav.subarray(44).some(byte=>byte!==0));
    assert.ok((wav.length-44)/(44100*2)<0.3);
  }
});
