// Runs outside Next's bundler. Uses the version pinned by remotion/package.json.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(path.join(process.cwd(), 'remotion', 'package.json'));
const { renderMedia, selectComposition, makeCancelSignal } = require('@remotion/renderer');
const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const remotionRoot = path.join(process.cwd(), 'remotion');
const [mode, input, output] = process.argv.slice(2);
let cancelRender = () => {};
process.on('SIGTERM', () => { cancelRender(); process.exitCode = 1; });
try {
  if (mode === 'probe') {
    const { Input, BufferSource, MP3 } = require('mediabunny');
    const media = new Input({ formats: [MP3], source: new BufferSource(fs.readFileSync(input)) });
    try {
      const duration = await media.computeDuration();
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Durasi audio tidak dapat dibaca.');
      emit({ type: 'metadata', duration });
    } finally { media.dispose(); }
  } else {
    const { bundle } = require('@remotion/bundler');
    const relative = path.relative(path.join(remotionRoot, 'src', 'episodes'), path.resolve(input));
    if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) throw new Error('Komposisi harus berada di proyek utama remotion/src/episodes/<slug>.');
    const entryPoint = path.join(input, 'index.tsx');
    const modules = path.join(process.cwd(), 'remotion', 'node_modules');
    emit({ type: 'progress', progress: 0, phase: 'Menyiapkan komposisi' });
    const serveUrl = await bundle({
      entryPoint, rootDir: remotionRoot, publicDir: path.join(remotionRoot, 'public'),
      outDir: path.join(path.dirname(output), `.bundle-${path.basename(output)}`),
      onProgress: (progress) => emit({ type: 'progress', progress: progress / 100 * 0.1, phase: 'Menyiapkan komposisi' }),
      webpackOverride: (config) => ({ ...config, resolve: {
        ...config.resolve, modules: [modules, path.join(process.cwd(), 'node_modules'), ...(config.resolve?.modules ?? ['node_modules'])],
        alias: { ...config.resolve?.alias, react: path.join(modules, 'react'), 'react-dom': path.join(modules, 'react-dom'), remotion: path.join(modules, 'remotion') },
      } }),
    });
    const composition = await selectComposition({ serveUrl, id: 'Episode', logLevel: 'error' });
    const { cancelSignal, cancel } = makeCancelSignal();
    cancelRender = cancel;
    await renderMedia({ serveUrl, composition, codec: 'h264', outputLocation: output,
      scale: mode === 'preview' ? 0.5 : 1, crf: mode === 'preview' ? 28 : 18,
      concurrency: 2, pixelFormat: 'yuv420p', cancelSignal, logLevel: 'error',
      onProgress: ({ progress }) => emit({ type: 'progress', progress: 0.1 + progress * 0.9, phase: 'Merender video' }),
    });
    emit({ type: 'done', output });
  }
} catch (error) {
  emit({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
