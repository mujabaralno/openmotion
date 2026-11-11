import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const originalCwd = process.cwd();
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'openmotion-pipeline-test-')));
process.chdir(temporary);
process.env.WORKSPACE_DIR = path.join(temporary, 'workspace');
process.env.WORKFLOW_TOKEN_PATH = path.join(temporary, 'token');
process.env.ELEVENLABS_API_KEY = 'local-test-key-never-sent';
fs.cpSync(path.join(root, 'agents'), path.join(temporary, 'agents'), { recursive: true });
fs.cpSync(path.join(root, 'scripts'), path.join(temporary, 'scripts'), { recursive: true });
fs.mkdirSync(path.join(temporary, 'remotion'), { recursive: true });
for (const name of ['package.json', 'tsconfig.json', 'AGENTS.md']) fs.copyFileSync(path.join(root, 'remotion', name), path.join(temporary, 'remotion', name));
fs.cpSync(path.join(root, 'remotion', 'src'), path.join(temporary, 'remotion', 'src'), { recursive: true, filter: source => !source.startsWith(path.join(root, 'remotion', 'src', 'episodes')) });
fs.symlinkSync(path.join(root, 'remotion', 'node_modules'), path.join(temporary, 'remotion', 'node_modules'), 'dir');

// Import after chdir: the database must never touch the user's data/app.db.
const { getDb } = await import('../src/server/db/index.ts');
const { createEpisode } = await import('../src/server/episodes/service.ts');
const { initializeWorkspace } = await import('../src/server/workspace/init.ts');
const { runPipelineStep, pipelineView, approveStep, reviseStep, saveTextArtifact, cancelPipelineStep } = await import('../src/server/pipeline/service.ts');
const { getSteps, recoverInterruptedSteps } = await import('../src/server/pipeline/state.ts');
const { artifactPath, readArtifact, writeArtifact } = await import('../src/server/pipeline/files.ts');
const { prepareComposition } = await import('../src/server/pipeline/composition.ts');
const { saveSettings } = await import('../src/server/pipeline/settings.ts');
const { subscribeStepStream, decidePermission, resetAgentStreamsForTests } = await import('../src/server/agent-streams/manager.ts');
const { generateVoiceover } = await import('../src/server/elevenlabs/client.ts');
const { safeStreamPrefix, redactText } = await import('../src/server/security/redact.ts');
const { buildStepPrompt } = await import('../src/server/pipeline/prompts.ts');

initializeWorkspace();
fs.writeFileSync(path.join(process.env.WORKSPACE_DIR!, 'agents.json'), JSON.stringify({ agents: [{ id: 'pipeline-test', name: 'Pipeline fixture', command: process.execPath, args: [path.join(root, 'tests/fixtures/pipeline-acp-agent.mjs')] }] }));
saveSettings({ agentId: 'pipeline-test', voiceId: 'local-voice' });

async function waitFor<T>(read: () => T | undefined | false, timeout = 15000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = read();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error('Timed out waiting for pipeline state.');
}
async function permission(slug: string, kind: 'script' | 'tags' | 'scenes' | 'thumbnail' | 'publish') {
  return waitFor(() => {
    const sub = subscribeStepStream({ episodeSlug: slug, kind, onEvent: () => {} });
    sub.unsubscribe();
    return sub.replay.find(event => event.type === 'permission' && event.permission.status === 'pending');
  });
}
async function finish(slug: string, kind: string, status = 'review', timeout = 15000) {
  await waitFor(() => {
    const view = pipelineView(slug);
    const step = view.steps.find(step => step.kind === kind)!;
    if (step.status === 'failed') throw new Error(step.error ?? 'Pipeline failed.');
    return step.status === status && !view.task;
  }, timeout);
}
async function agentStep(slug: string, kind: 'script' | 'tags' | 'scenes' | 'thumbnail' | 'publish') {
  await runPipelineStep(slug, kind);
  const event = await permission(slug, kind);
  assert.equal(event.type, 'permission');
  if (event.type === 'permission') await decidePermission(event.permission.id, 'approve');
  await finish(slug, kind, 'review', kind === 'scenes' ? 180000 : 15000);
}

after(async () => {
  await resetAgentStreamsForTests();
  getDb().close();
  process.chdir(originalCwd);
  fs.rmSync(temporary, { recursive: true, force: true });
});

test('topic → approved packet → unchanged tagged narration, with permission rejection and cancellation', async () => {
  const episode = createEpisode({ title: '', topic: 'Why are shadows long?' });
  assert.equal(episode.title, episode.topic);
  await assert.rejects(runPipelineStep(episode.slug, 'tags'), /Setujui/);
  await runPipelineStep(episode.slug, 'script');
  const event = await permission(episode.slug, 'script');
  assert.equal(fs.existsSync(artifactPath(episode.slug, '01-episode.md')), false);
  await assert.rejects(runPipelineStep(episode.slug, 'script'), /Tunggu|berjalan/);
  assert.throws(() => approveStep(episode.slug, 'script'), /review/);
  if (event.type === 'permission') await decidePermission(event.permission.id, 'reject');
  await waitFor(() => getSteps(episode.slug)[0].status === 'failed' && !pipelineView(episode.slug).task);
  assert.equal(fs.existsSync(artifactPath(episode.slug, '01-episode.md')), false);
  await agentStep(episode.slug, 'script');
  assert.equal(readArtifact(episode.slug, '01-naskah.md').trim(), 'A short local test.');
  approveStep(episode.slug, 'script');
  await agentStep(episode.slug, 'tags');
  approveStep(episode.slug, 'tags');
  assert.throws(() => saveTextArtifact(episode.slug, '02-naskah-tagged.md', '[happy] Changed words.'), /mengubah kata/);
  assert.equal(getSteps(episode.slug)[1].status, 'idle');
  await agentStep(episode.slug, 'tags');
  approveStep(episode.slug, 'tags');
  reviseStep(episode.slug, 'script', 'Make the opening clearer.');
  assert.deepEqual(getSteps(episode.slug).map(step => step.status), Array(7).fill('idle'));
  assert.match(buildStepPrompt(episode.slug, 'script', getSteps(episode.slug)[0].notes), /Make the opening clearer/);
  await runPipelineStep(episode.slug, 'script');
  await permission(episode.slug, 'script');
  await cancelPipelineStep(episode.slug, 'script');
  await waitFor(() => !pipelineView(episode.slug).task);
  assert.equal(getSteps(episode.slug)[0].status, 'failed');
  assert.match(getSteps(episode.slug)[0].error!, /Dibatalkan/);
  const decisions = getDb().prepare('SELECT decision FROM permission_log WHERE step_id IN (SELECT id FROM steps WHERE episode_id=?)').all(episode.id) as { decision: string }[];
  assert.deepEqual(decisions.map(row => row.decision), ['rejected', 'approved', 'approved', 'approved']);
});

test('complete production pipeline: stubbed ElevenLabs, actual MP3 probe, preview and final MP4', { timeout: 360000, skip: process.env.OPENMOTION_RENDER_TESTS !== '1' }, async () => {
  const episode = createEpisode({ title: 'Render QA', topic: 'Local rendering test' });
  await agentStep(episode.slug, 'script'); approveStep(episode.slug, 'script');
  await agentStep(episode.slug, 'tags'); approveStep(episode.slug, 'tags');
  const audioFile = path.join(temporary, 'fixture.mp3');
  const encoder = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-codec:a', 'libmp3lame', audioFile]);
  assert.equal(encoder.status, 0, String(encoder.stderr));
  const audio = fs.readFileSync(audioFile);
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (input, options) => {
    requests++;
    assert.match(String(input), /^https:\/\/api.elevenlabs.io\/v1\/text-to-speech\/local-voice\/with-timestamps/);
    assert.equal(JSON.parse(options!.body as string).text, '[curious] A short local test.');
    return Response.json({ audio_base64: audio.toString('base64'), alignment: null });
  };
  try {
    await runPipelineStep(episode.slug, 'voiceover');
    await finish(episode.slug, 'voiceover');
    assert.equal(requests, 1);
    assert.ok(pipelineView(episode.slug).audio!.duration! > 0);
    approveStep(episode.slug, 'voiceover');
    await agentStep(episode.slug, 'scenes');
    assert.equal(path.dirname(artifactPath(episode.slug, 'Episode.tsx', 'composition')), path.join(temporary, 'remotion', 'src', 'episodes', episode.slug));
    assert.equal(fs.existsSync(path.join(temporary, 'remotion', 'test-execution.json')), true);
    assert.equal(fs.existsSync(path.join(process.env.WORKSPACE_DIR!, 'episodes', episode.slug, 'remotion')), false);
    assert.equal(pipelineView(episode.slug).previewAvailable, true);
    assert.equal(pipelineView(episode.slug).scenes!.captionsEstimated, true);
    approveStep(episode.slug, 'scenes');
    const source = artifactPath(episode.slug, 'Episode.tsx', 'composition');
    const originalSource = fs.readFileSync(source, 'utf8');
    fs.appendFileSync(source, '\n// changed after preview\n');
    await runPipelineStep(episode.slug, 'render');
    await waitFor(() => getSteps(episode.slug)[4].status === 'failed' && !pipelineView(episode.slug).task);
    assert.match(getSteps(episode.slug)[4].error!, /berubah setelah preview/);
    fs.writeFileSync(source, originalSource);
    await runPipelineStep(episode.slug, 'render');
    await finish(episode.slug, 'render', 'review', 180000);
    approveStep(episode.slug, 'render');
    assert.deepEqual(getSteps(episode.slug).slice(0, 5).map(step => step.status), Array(5).fill('approved'));
    assert.equal(pipelineView(episode.slug).renderJob!.status, 'completed');
    const video = artifactPath(episode.slug, `${episode.slug}.mp4`, 'out');
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', video]);
    assert.equal(probe.status, 0, String(probe.stderr));
    const media = JSON.parse(String(probe.stdout));
    assert.ok(media.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio'));
    assert.ok(media.streams.some((stream: { width: number; height: number }) => stream.width === 1080 && stream.height === 1920));
    assert.ok(Number(media.format.duration) >= 3.5);
    reviseStep(episode.slug, 'render', 'Adjust the scene.');
    assert.deepEqual(getSteps(episode.slug).slice(3).map(step => step.status), Array(4).fill('idle'));
    reviseStep(episode.slug, 'voiceover', 'Regenerate audio.');
    await assert.rejects(runPipelineStep(episode.slug, 'voiceover'), /Konfirmasi penimpaan/);
    assert.equal(requests, 1);
    // Failed provider requests preserve the previously committed MP3.
    globalThis.fetch = async () => Response.json({ detail: { message: 'No credit local-test-key-never-sent' } }, { status: 429 });
    await assert.rejects(generateVoiceover(episode.slug, new AbortController().signal), /429/);
    assert.deepEqual(fs.readFileSync(artifactPath(episode.slug, '03-voiceover.mp3')), audio);
  } finally { globalThis.fetch = originalFetch; }
});

test('restart recovery and credentials split across streamed chunks', () => {
  const episode = createEpisode({ title: 'Recovery', topic: 'Interrupted work' });
  getDb().prepare("UPDATE steps SET status='running' WHERE episode_id=? AND kind='script'").run(episode.id);
  recoverInterruptedSteps();
  assert.equal(getSteps(episode.slug)[0].status, 'failed');
  const first = safeStreamPrefix('hello local-test-key-');
  assert.equal(first.text, 'hello ');
  const second = safeStreamPrefix(first.rest + 'never-sent done');
  assert.equal(second.text, '[REDACTED] done');
  assert.equal(redactText(process.env.ELEVENLABS_API_KEY!), '[REDACTED]');
});

test('pipeline sends and persists the selected agent, model and effort; invalid models never receive a prompt', async () => {
  const configPath = path.join(process.env.WORKSPACE_DIR!, 'agents.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.agents.push({ id: 'configured', name: 'Configured fixture', command: process.execPath, args: [path.join(root, 'tests/fixtures/pipeline-acp-agent.mjs'), '--config', '--expect-config'] });
  fs.writeFileSync(configPath, JSON.stringify(config));
  const episode = createEpisode({ title: 'Explicit model', topic: 'Model selection' });
  await runPipelineStep(episode.slug, 'script', { agentId: 'configured', modelId: 'fast', effort: 'low' });
  const event = await permission(episode.slug, 'script');
  if (event.type === 'permission') await decidePermission(event.permission.id, 'approve');
  await finish(episode.slug, 'script');
  const step = getSteps(episode.slug)[0];
  assert.equal(step.agentId, 'configured');
  assert.equal(step.modelId, 'fast');
  assert.equal(step.effort, 'low');
  const executionFile = path.join(process.env.WORKSPACE_DIR!, 'episodes', episode.slug, 'test-execution.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(executionFile, 'utf8')), { model: 'fast', effort: 'low' });
  const modified = fs.statSync(executionFile).mtimeMs;
  reviseStep(episode.slug, 'script', 'Try a different model.');
  await assert.rejects(runPipelineStep(episode.slug, 'script', { agentId: 'configured', modelId: 'not-a-model', effort: 'low' }), /tidak tersedia/);
  assert.equal(getSteps(episode.slug)[0].status, 'failed');
  assert.equal(fs.statSync(executionFile).mtimeMs, modified);
});

test('composition uses the shared project and preserves legacy source and original audio', () => {
  const episode = createEpisode({ title: 'Shared project', topic: 'Shared Remotion project' });
  writeArtifact(episode.slug, '01-naskah.md', 'A local narration.');
  writeArtifact(episode.slug, '03-audio.json', JSON.stringify({ duration: 1 }));
  writeArtifact(episode.slug, '03-voiceover.timestamps.json', JSON.stringify({ alignment: null }));
  writeArtifact(episode.slug, '03-voiceover.mp3', Buffer.from('path-staging-fixture'));
  const legacyDirectory = path.join(process.env.WORKSPACE_DIR!, 'episodes', episode.slug, 'remotion');
  fs.mkdirSync(legacyDirectory, { recursive: true });
  const legacySource = path.join(legacyDirectory, 'Episode.tsx');
  fs.writeFileSync(legacySource, 'export default function Episode(){return null;}');
  prepareComposition(episode.slug);
  const source = artifactPath(episode.slug, 'Episode.tsx', 'composition');
  assert.equal(source, path.join(temporary, 'remotion', 'src', 'episodes', episode.slug, 'Episode.tsx'));
  assert.equal(fs.readFileSync(source, 'utf8'), fs.readFileSync(legacySource, 'utf8'));
  assert.deepEqual(fs.readFileSync(artifactPath(episode.slug, 'audio.mp3', 'composition-public')), fs.readFileSync(artifactPath(episode.slug, '03-voiceover.mp3')));
  assert.match(fs.readFileSync(artifactPath(episode.slug, 'index.tsx', 'composition'), 'utf8'), new RegExp(`episodes/${episode.slug}/audio.mp3`));
  const entry = fs.readFileSync(artifactPath(episode.slug, 'index.tsx', 'composition'), 'utf8');
  assert.match(entry, /Mystery Lab/);
  assert.equal((entry.match(/<Audio src=/g) ?? []).length, 1);
  const props = JSON.parse(fs.readFileSync(artifactPath(episode.slug, 'props.json', 'composition'), 'utf8'));
  assert.equal(props.sfx.pop, `episodes/${episode.slug}/sfx-pop.wav`);
  assert.equal(fs.readFileSync(artifactPath(episode.slug, 'sfx-pop.wav', 'composition-public')).toString('ascii',0,4), 'RIFF');
  fs.appendFileSync(source, '\n// newer shared-project source');
  prepareComposition(episode.slug);
  assert.match(fs.readFileSync(source, 'utf8'), /newer shared-project source/);
  assert.doesNotMatch(fs.readFileSync(legacySource, 'utf8'), /newer shared-project source/);
  const prompt = buildStepPrompt(episode.slug, 'scenes', '');
  assert.ok(prompt.includes(`SCENE_OUTPUT_FILE: ${source}`));
  assert.ok(prompt.includes(`This is your working directory.`));
  const typecheck = spawnSync(process.execPath, [path.join(root, 'remotion', 'node_modules', 'typescript', 'bin', 'tsc'), '--project', path.join(temporary, 'remotion', 'tsconfig.json'), '--noEmit']);
  assert.equal(typecheck.status, 0, String(typecheck.stdout) + String(typecheck.stderr));
});

test('preparing a new scene does not create an entry importing a missing visual source', () => {
  const episode = createEpisode({ title: 'Pending visual', topic: 'Pending visual source' });
  writeArtifact(episode.slug, '01-naskah.md', 'A local narration.');
  writeArtifact(episode.slug, '03-audio.json', JSON.stringify({ duration: 1 }));
  writeArtifact(episode.slug, '03-voiceover.timestamps.json', JSON.stringify({ alignment: null }));
  writeArtifact(episode.slug, '03-voiceover.mp3', Buffer.from('path-staging-fixture'));
  prepareComposition(episode.slug);
  assert.equal(fs.existsSync(artifactPath(episode.slug, 'props.json', 'composition')), true);
  assert.equal(fs.existsSync(artifactPath(episode.slug, 'index.tsx', 'composition')), false);
  writeArtifact(episode.slug, 'Episode.tsx', 'export default function Episode(){return null;}', 'composition');
  prepareComposition(episode.slug);
  assert.equal(fs.existsSync(artifactPath(episode.slug, 'index.tsx', 'composition')), true);
});

test('post-production gates, permission decisions, publication editing, and scoped revisions', async () => {
  const episode = createEpisode({ title: 'Post production', topic: 'Why shadows grow' });
  await assert.rejects(runPipelineStep(episode.slug, 'thumbnail'), /Setujui/);
  await assert.rejects(runPipelineStep(episode.slug, 'publish'), /Setujui/);
  // Pretend the existing production stages were approved, without paid API calls or a render.
  getDb().prepare("UPDATE steps SET status='approved' WHERE episode_id=? AND kind IN ('script','tags','voiceover','scenes','render')").run(episode.id);
  const prompt = buildStepPrompt(episode.slug, 'thumbnail', 'Use the opening scene');
  assert.ok(prompt.includes(artifactPath(episode.slug, 'Episode.tsx', 'composition')));
  assert.match(prompt, /Use the opening scene/);
  assert.match(prompt, /self-contained/);
  await runPipelineStep(episode.slug, 'thumbnail');
  const event = await permission(episode.slug, 'thumbnail');
  if (event.type === 'permission') await decidePermission(event.permission.id, 'reject');
  await waitFor(() => getSteps(episode.slug)[5].status === 'failed' && !pipelineView(episode.slug).task);
  assert.equal(fs.existsSync(artifactPath(episode.slug, '05-thumbnail.svg')), false);
  await agentStep(episode.slug, 'thumbnail');
  const svg = readArtifact(episode.slug, '05-thumbnail.svg');
  writeArtifact(episode.slug, '05-thumbnail.svg', '<svg><script/></svg>');
  assert.throws(() => approveStep(episode.slug, 'thumbnail'), /SVG/);
  writeArtifact(episode.slug, '05-thumbnail.svg', svg);
  approveStep(episode.slug, 'thumbnail');
  await agentStep(episode.slug, 'publish');
  approveStep(episode.slug, 'publish');
  assert.ok(getSteps(episode.slug).every(step => step.status === 'approved'));
  const original = readArtifact(episode.slug, '06-publish.md');
  assert.throws(() => saveTextArtifact(episode.slug, '06-publish.md', 'Missing sections'), /bagian/);
  assert.equal(readArtifact(episode.slug, '06-publish.md'), original);
  assert.equal(getSteps(episode.slug)[6].status, 'approved');
  saveTextArtifact(episode.slug, '06-publish.md', original.replace('Why shadows grow', 'Why shadows change'));
  assert.equal(getSteps(episode.slug)[6].status, 'review');
  assert.ok(getSteps(episode.slug).slice(0, 6).every(step => step.status === 'approved'));
  approveStep(episode.slug, 'publish');
  reviseStep(episode.slug, 'thumbnail', 'Make the subject larger.');
  assert.deepEqual(getSteps(episode.slug).map(step => step.status), [...Array(5).fill('approved'), 'idle', 'idle']);
  assert.equal(readArtifact(episode.slug, '05-thumbnail.svg'), svg);
});


test('creator direction overrides legacy templates without changing those files', () => {
  const episode = createEpisode({ title: 'Creator direction', topic: 'Motion educational' });
  const template = path.join(process.env.WORKSPACE_DIR!, 'prompts', 'script.md');
  const original = fs.readFileSync(template, 'utf8');
  try {
    fs.writeFileSync(template, 'Create the complete package. Legacy English narration instructions.');
    const prompt = buildStepPrompt(episode.slug, 'script', 'Keep the explanation legible');
    assert.match(prompt, /master voice-over must be in Bahasa Indonesia/);
    assert.match(prompt, /production instructions and scene prompts in English/);
    assert.match(prompt, /educational 2.5D parallax/);
    assert.match(prompt, /Mystery Lab/);
    assert.match(prompt, /Sound Effects cue plan/);
    assert.match(prompt, /ONE continuous ElevenLabs track/);
    assert.equal(fs.readFileSync(template, 'utf8'), 'Create the complete package. Legacy English narration instructions.');
    const tags = buildStepPrompt(episode.slug, 'tags', '');
    assert.match(tags, /Never translate or rewrite an already approved script/);
    const scenes = buildStepPrompt(episode.slug, 'scenes', '');
    assert.match(scenes, /props.sfx.whoosh/);
    assert.match(scenes, /at or below 0.18/);
  } finally { fs.writeFileSync(template, original); }
});
