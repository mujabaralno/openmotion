import { SaxesParser } from 'saxes';

const elements = new Set(['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'filter', 'feGaussianBlur', 'feOffset', 'feFlood', 'feComposite', 'feMerge', 'feMergeNode', 'feColorMatrix']);
const attributes = new Set(`xmlns version viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points id transform opacity fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit font-family font-size font-weight font-style letter-spacing text-anchor dominant-baseline dx dy textLength lengthAdjust offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod fx fy fr clip-path clip-rule clipPathUnits mask maskUnits maskContentUnits filter filterUnits primitiveUnits color-interpolation-filters stdDeviation in in2 result flood-color flood-opacity operator k1 k2 k3 k4 mode type values preserveAspectRatio`.split(' '));

/** Accept only self-contained, static drawing markup, including when downloaded directly. */
export function validateThumbnail(content: string): void {
  if (!content.trim() || Buffer.byteLength(content) > 200_000) throw new Error('Thumbnail SVG wajib diisi, maksimal 200 KB.');
  const parser = new SaxesParser({ xmlns: false });
  let depth = 0; let count = 0;
  const reject = () => { throw new Error('Thumbnail harus berupa SVG statis mandiri: tanpa script, style, animasi, atau sumber eksternal.'); };
  parser.on('doctype', reject);
  parser.on('processinginstruction', reject);
  parser.on('error', () => { throw new Error('Struktur XML thumbnail SVG tidak valid.'); });
  parser.on('opentag', tag => {
    depth += 1; count += 1;
    if (depth > 32 || count > 5000 || !elements.has(tag.name)) reject();
    if (count === 1 && (tag.name !== 'svg' || tag.attributes.xmlns !== 'http://www.w3.org/2000/svg' || tag.attributes.viewBox?.trim().replace(/[\s,]+/g, ' ') !== '0 0 1080 1920')) {
      throw new Error('Thumbnail harus memiliki root SVG dengan xmlns SVG dan viewBox="0 0 1080 1920".');
    }
    for (const [name, value] of Object.entries(tag.attributes)) {
      if (!attributes.has(name) || /[\\<>]/.test(value)) reject();
      if (name === 'xmlns' && (count !== 1 || value !== 'http://www.w3.org/2000/svg')) reject();
      if (/url\s*\(/i.test(value) && !/^url\(#[a-zA-Z_][\w.-]*\)$/.test(value)) reject();
    }
  });
  parser.on('closetag', () => { depth -= 1; });
  parser.write(content).close();
  if (!count) throw new Error('Thumbnail SVG belum berisi gambar.');
}
