// Production build + HTTP/SSE checks. All state lives in a disposable checkout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const project = fs.mkdtempSync(path.join(root, '.next-build-check-'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'openmotion-dashboard-'));
const workspace = path.join(temporary, 'workspace');
const next = path.join(root, 'node_modules/next/dist/bin/next');
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'SystemRoot', 'WINDIR'].includes(key))), NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', WORKSPACE_DIR: workspace, WORKFLOW_TOKEN_PATH: path.join(temporary, 'token') };
let server;
let logs = '';
let passed = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, condition) => { assert.ok(condition, name); passed++; console.log(`PASS ${name}`); };
for (const name of ['src', 'agents', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.ts', 'postcss.config.mjs', 'components.json', 'public']) {
  if (fs.existsSync(path.join(root, name))) fs.cpSync(path.join(root, name), path.join(project, name), { recursive: true });
}
fs.symlinkSync(path.join(root, 'node_modules'), path.join(project, 'node_modules'), 'dir');
fs.symlinkSync(path.join(root, 'remotion'), path.join(project, 'remotion'), 'dir');
function start(args) {
  const child = spawn(process.execPath, [next, ...args], { cwd: project, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { logs += String(data); if (args[0] === 'build') process.stdout.write(data); });
  child.stderr.on('data', data => { logs += String(data); if (args[0] === 'build') process.stderr.write(data); });
  return child;
}
async function waitFor(read, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { try { const value = await read(); if (value) return value; } catch { /* server starting or state still changing */ } await pause(100); }
  throw new Error('Timed out waiting for server/state.');
}
async function stop() {
  if (!server?.pid || server.exitCode !== null) return;
  const stopped = new Promise(resolve => server.once('exit', resolve));
  process.kill(-server.pid, 'SIGTERM');
  await Promise.race([stopped, pause(5000)]);
  try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already stopped */ }
}
try {
  console.log('Building disposable production checkout…');
  const build = start(['build']);
  const code = await new Promise((resolve, reject) => { build.on('error', reject); build.on('exit', resolve); });
  assert.equal(code, 0, logs.slice(-12000));
  check('production build succeeds', true);
  const port = await new Promise((resolve, reject) => { const listener = net.createServer(); listener.on('error', reject); listener.listen(0, '127.0.0.1', () => { const port = listener.address().port; listener.close(() => resolve(port)); }); });
  env.APP_PORT = String(port);
  server = start(['start', '-H', '127.0.0.1', '-p', String(port)]);
  const base = `http://127.0.0.1:${port}`;
  const session = await waitFor(async () => { const result = await fetch(`${base}/api/security/session`); return result.ok && result; });
  const cookie = session.headers.get('set-cookie').split(';')[0];
  async function request(url, method = 'GET', body) {
    return fetch(`${base}${url}`, { method, headers: { cookie, origin: base, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  }
  for (const name of ['episodes', 'prompts', 'guide', 'agents/shorts-episode-parallax']) check(`workspace/${name} initialized`, fs.statSync(path.join(workspace, name)).isDirectory());
  const agents = { agents: [{ id: 'pipeline-test', name: 'Pipeline fixture', command: process.execPath, args: [path.join(root, 'tests/fixtures/pipeline-acp-agent.mjs'), '--config', '--expect-config'] }] };
  check('agent configuration saves', (await request('/api/settings', 'PUT', { file: 'agents.json', content: JSON.stringify(agents) })).ok);
  const presetResponse = await request('/api/settings', 'PUT', { preset: 'codex' });
  const preset = await presetResponse.json();
  check('agent preset appends without replacing configured agents', presetResponse.ok && JSON.parse(preset.content).agents.map(agent => agent.id).join(',') === 'pipeline-test,codex');
  check('duplicate preset rejected', (await request('/api/settings', 'PUT', { preset: 'codex' })).status === 400);
  const created = await request('/api/episodes', 'POST', { topic: 'Dashboard QA episode' });
  check('topic-only episode creation', created.status === 201);
  const { episode } = await created.json();
  const endpoint = `/api/episodes/${episode.slug}`;
  for (const url of ['/episodes', '/settings', `/episodes/${episode.slug}`]) {
    const response = await request(url);
    const html = await response.text();
    check(`page ${url} renders`, response.ok && html.includes('OpenMotion') && !html.includes('NEXT_HTTP_ERROR_FALLBACK;500'));
  }
  check('invalid stage rejected', (await request(`${endpoint}/steps/unknown/run`, 'POST', {})).status === 400);
  check('cannot skip prerequisite', (await request(`${endpoint}/steps/tags/run`, 'POST', {})).status === 400);
  const catalogResponse = await request(`${endpoint}/steps/script/options`, 'POST', { agentId: 'pipeline-test' });
  const catalog = await catalogResponse.json();
  check('model discovery returns agent catalog', catalogResponse.ok && catalog.model.options.length === 3);
  const fastOptions = await (await request(`${endpoint}/steps/script/options`, 'POST', { agentId: 'pipeline-test', modelId: 'fast' })).json();
  check('effort options follow the selected model', fastOptions.effort.options.map(option => option.value).join(',') === 'low,medium');
  check('catalog discovery sends no prompt', !fs.existsSync(path.join(workspace, 'episodes', episode.slug, 'test-execution.json')));
  check('starts server-built script prompt', (await request(`${endpoint}/steps/script/run`, 'POST', { agentId: 'pipeline-test', modelId: 'fast', effort: 'low' })).status === 202);
  const controller = new AbortController();
  const sse = await fetch(`${base}${endpoint}/steps/script/stream`, { headers: { cookie }, signal: controller.signal });
  check('SSE response type', sse.headers.get('content-type').includes('text/event-stream'));
  const reader = sse.body.getReader();
  let stream = '';
  let permission;
  while (!permission) {
    const { value, done } = await reader.read();
    assert.equal(done, false);
    stream += new TextDecoder().decode(value);
    for (const line of stream.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try { const event = JSON.parse(line.slice(6)); if (event.type === 'permission' && event.permission.status === 'pending') permission = event.permission; } catch { /* incomplete chunk */ }
    }
  }
  controller.abort();
  check('text arrives before permission decision', stream.includes('Preparing ') && stream.includes('local episode.'));
  check('no file written before approval', !fs.existsSync(path.join(workspace, 'episodes', episode.slug, '01-episode.md')));
  check('settings blocked while agent active', (await request('/api/settings', 'PUT', { language: 'Indonesian' })).status === 400);
  check('permission API accepts decision', (await request(`/api/permissions/${permission.id}`, 'POST', { decision: 'approve' })).ok);
  await waitFor(async () => { const view = await (await request(`${endpoint}/pipeline`)).json(); return view.steps[0].status === 'review' && !view.task; });
  const configuredStep = (await (await request(`${endpoint}/pipeline`)).json()).steps[0];
  check('chosen model and effort reach the agent and persist', configuredStep.modelId === 'fast' && configuredStep.effort === 'low' && JSON.parse(fs.readFileSync(path.join(workspace, 'episodes', episode.slug, 'test-execution.json'), 'utf8')).effort === 'low');
  const replay = await (await request(`${endpoint}/steps/script/stream`)).text();
  check('SSE history survives reconnect', replay.includes('local episode.') && replay.includes('completed'));
  check('packet approval succeeds', (await request(`${endpoint}/steps/script/approve`, 'POST', {})).ok);
  check('invalid editor filename rejected', (await request(`${endpoint}/files/agents.json`, 'PUT', { content: '{}' })).status === 400);
  const edited = await request(`${endpoint}/files/01-naskah.md`, 'PUT', { content: 'An updated local narration.' });
  check('narration editor updates packet', edited.ok && fs.readFileSync(path.join(workspace, 'episodes', episode.slug, '01-episode.md'), 'utf8').includes('An updated local narration.'));
  const view = await (await request(`${endpoint}/pipeline`)).json();
  check('editing invalidates downstream approval', view.steps[0].status === 'review' && view.steps.slice(1).every(step => step.status === 'idle'));
  // Byte-range serving is independent of the render engine: use a known local payload.
  const media = path.join(workspace, 'episodes', episode.slug, 'out'); fs.mkdirSync(media, { recursive: true }); fs.writeFileSync(path.join(media, 'preview.mp4'), '0123456789');
  const range = await fetch(`${base}/api/media/${episode.slug}/preview.mp4`, { headers: { range: 'bytes=2-5' } });
  check('media byte range', range.status === 206 && range.headers.get('content-range') === 'bytes 2-5/10' && await range.text() === '2345');
  const head = await request(`/api/media/${episode.slug}/preview.mp4`, 'HEAD');
  // Next's Node adapter strips Content-Length; validate the supported metadata.
  check('media HEAD metadata and empty body', head.status === 200 && head.headers.get('content-type') === 'video/mp4' && head.headers.get('accept-ranges') === 'bytes' && await head.text() === '');
  const suffix = await fetch(`${base}/api/media/${episode.slug}/preview.mp4`, { headers: { range: 'bytes=-3' } });
  check('media suffix byte range', suffix.status === 206 && await suffix.text() === '789');
  const invalidRange = await fetch(`${base}/api/media/${episode.slug}/preview.mp4`, { headers: { range: 'bytes=20-30' } });
  check('invalid range returns 416', invalidRange.status === 416 && invalidRange.headers.get('content-range') === 'bytes */10');
  check('missing episode returns 404', (await request('/api/episodes/not-found/pipeline')).status === 404);
  await stop();
  server = start(['start', '-H', '127.0.0.1', '-p', String(port)]);
  await waitFor(async () => (await fetch(`${base}/api/security/session`)).ok);
  const persisted = await (await request(`${endpoint}/pipeline`)).json();
  check('episode and stage status survive restart', persisted.episode.slug === episode.slug && persisted.steps[0].status === 'review');
  check('model and effort survive restart', persisted.steps[0].modelId === 'fast' && persisted.steps[0].effort === 'low');
  const persistedReplay = await (await request(`${endpoint}/steps/script/stream`)).text();
  check('SSE log replays after server restart', persistedReplay.includes('local episode.') && persistedReplay.includes('completed'));
  console.log(`${passed} production/HTTP/SSE checks passed.`);
  if (process.argv.includes('--keep')) {
    fs.writeFileSync('/tmp/openmotion-dashboard-qa.json', JSON.stringify({ url: base, project, workspace, slug: episode.slug }));
    console.log(`Browser QA ready: ${base}`);
    await new Promise(resolve => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve); setTimeout(resolve, 15 * 60 * 1000).unref(); });
  }
} catch (error) {
  console.error(error);
  console.error(logs.slice(-10000));
  process.exitCode = 1;
} finally {
  await stop();
  fs.rmSync(project, { recursive: true, force: true });
  fs.rmSync(temporary, { recursive: true, force: true });
}
