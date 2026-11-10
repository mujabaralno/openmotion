import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { AcpSession } from '../src/server/acp/client.ts';
import { discoverAgentOptions } from '../src/server/agents/options.ts';
import { executionOptions, parseConfigOptions } from '../src/server/acp/configuration.ts';
import { stopAllAgentSessions } from '../src/server/agents/registry.ts';

async function fixture(flags: string[], run: (root: string, episode: string) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openmotion-config-'));
  const episode = path.join(root, 'episodes', 'options-test');
  fs.mkdirSync(episode, { recursive: true });
  fs.writeFileSync(path.join(episode, 'episode.json'), '{}');
  fs.writeFileSync(path.join(root, 'agents.json'), JSON.stringify({ agents: [{ id: 'fixture', name: 'Fixture', command: process.execPath, args: [path.resolve('tests/fixtures/pipeline-acp-agent.mjs'), ...flags] }] }));
  try { await run(root, episode); } finally { stopAllAgentSessions({ force: true }); fs.rmSync(root, { recursive: true, force: true }); }
}
function session(root: string) { return new AcpSession({ sessionId: `test-${Date.now()}`, agentId: 'fixture', episodeSlug: 'options-test', workspaceRoot: root }); }

test('grouped options and missing categories remain usable; permission selectors are not mistaken for effort', () => {
  const parsed = parseConfigOptions([{ id: 'models', name: 'Model', type: 'select', currentValue: 'a', options: [{ group: 'provider', name: 'Provider', options: [{ value: 'a', name: 'Model A' }] }] }, { id: 'approval', category: 'mode', type: 'select', currentValue: 'high', options: [] }, { id: 'effort', type: 'boolean', currentValue: true }]);
  assert.equal(executionOptions(parsed, null).model!.options[0].group, 'Provider');
  assert.equal(executionOptions(parsed, null).effort, null);
});

test('discover model-specific efforts without sending a prompt', async () => {
  await fixture(['--config'], async (root, episode) => {
    const initial = await discoverAgentOptions({ agentId: 'fixture', episodeSlug: 'options-test', workspaceRoot: root });
    assert.equal(initial.model!.currentValue, 'slow');
    assert.deepEqual(initial.effort!.options.map(choice => choice.value), ['medium', 'high']);
    const fast = await discoverAgentOptions({ agentId: 'fixture', episodeSlug: 'options-test', workspaceRoot: root, modelId: 'fast' });
    assert.deepEqual(fast.effort!.options.map(choice => choice.value), ['low', 'medium']);
    assert.equal(fs.existsSync(path.join(episode, 'test-execution.json')), false);
  });
});

test('requested model and effort are applied before the prompt; stale effort is rejected', async () => {
  await fixture(['--config', '--expect-config'], async (root, episode) => {
    const client = session(root);
    try {
      await client.start();
      await client.configure({ modelId: 'fast', effort: 'low' });
      assert.equal(client.configuration.model!.currentValue, 'fast');
      assert.equal(client.configuration.effort!.currentValue, 'low');
      await assert.rejects(client.configure({ effort: 'high' }), /tidak tersedia/);
      assert.equal(fs.existsSync(path.join(episode, 'test-execution.json')), false);
      await client.prompt('Create the complete test packet');
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(episode, 'test-execution.json'), 'utf8')), { model: 'fast', effort: 'low' });
      await client.configure({ modelId: 'plain' });
      assert.equal(client.configuration.effort, null);
      await assert.rejects(client.configure({ effort: 'low' }), /tidak dapat diatur/);
    } finally { await client.close(); }
  });
});

test('an ignored configuration change fails rather than silently using the default', async () => {
  await fixture(['--config', '--ignore-config'], async (root, episode) => {
    const client = session(root);
    try {
      await client.start();
      await assert.rejects(client.configure({ modelId: 'fast' }), /tidak mengonfirmasi/);
      assert.equal(fs.existsSync(path.join(episode, 'test-execution.json')), false);
    } finally { await client.close(); }
  });
});

test('legacy model selection works and unsupported effort fails clearly', async () => {
  await fixture(['--legacy'], async root => {
    const client = session(root);
    try {
      await client.start(); await client.configure({ modelId: 'fast' });
      assert.equal(client.configuration.model!.currentValue, 'fast');
      await assert.rejects(client.configure({ effort: 'low' }), /tidak dapat diatur/);
    } finally { await client.close(); }
  });
});
