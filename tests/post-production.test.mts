import assert from 'node:assert/strict';
import test from 'node:test';
import { validateThumbnail } from '../src/server/pipeline/thumbnail.ts';
import { parsePublishPack } from '../src/lib/publish-pack.ts';

const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">${body}</svg>`;
test('thumbnail accepts static episode shapes and local gradients', () => {
  assert.doesNotThrow(() => validateThumbnail(wrap('<defs><linearGradient id="sky"><stop offset="0" stop-color="#79c8ef"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#sky)"/><text x="100" y="100">Why shadows?</text>')));
});
test('thumbnail rejects active SVG, external resources and malformed documents', () => {
  for (const body of ['<script>alert(1)</script>', '<rect onclick="alert(1)"/>', '<image href="https://example.com/image.png"/>', '<foreignObject/>', '<style>text{fill:red}</style>', '<rect style="fill:red"/>', '<animate attributeName="x"/>', '<rect fill="url(https://example.com/a.svg#x)"/>', '<rect fill="url(&#x68;ttps://example.com/a.svg#x)"/>', '<rect fill="u\\72l(https://example.com)"/>', '<rect>', '<use href="#x"/>', '<svg xmlns="https://example.com"/>']) assert.throws(() => validateThumbnail(wrap(body)), Error, body);
  assert.throws(() => validateThumbnail('<!DOCTYPE svg SYSTEM "https://example.com/a.dtd">' + wrap('<rect/>')));
  assert.throws(() => validateThumbnail('<?xml-stylesheet href="https://example.com"?>' + wrap('<rect/>')));
  assert.throws(() => validateThumbnail('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"/>'));
  assert.throws(() => validateThumbnail(wrap('<text>' + 'a'.repeat(200_000) + '</text>')));
});
test('publication parses copy-ready fields and validates missing, duplicate, oversized sections', () => {
  const valid = '## Judul\nWhy shadows?\n\n## Deskripsi\nLearn how shadows work.\nA local episode.\n\n## Hashtag\n#Shadows #Sains #Shorts';
  assert.deepEqual(parsePublishPack(valid), { title: 'Why shadows?', description: 'Learn how shadows work.\nA local episode.', hashtags: '#Shadows #Sains #Shorts' });
  for (const invalid of [valid.replace('## Judul', '## Title'), valid.replace('Why shadows?', ''), valid.replace('Why shadows?', 'a'.repeat(101)), valid.replace('#Shadows #Sains #Shorts', '#Shadows #shadows'), valid.replace('#Shadows #Sains #Shorts', 'no hashtag'), valid + '\n## Hashtag\n#Extra']) assert.throws(() => parsePublishPack(invalid));
});
