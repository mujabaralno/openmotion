// Deterministic ACP fixture: it only writes after allow_once is selected.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const send = message => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
const reply = (id, result) => send({ id, result });
let cwd = '';
let pending = null;
let model = 'slow';
let effort = 'high';
const configured = process.argv.includes('--config');
const legacy = process.argv.includes('--legacy');
const choices = () => [
  { id: 'model', category: 'model', name: 'Model', type: 'select', currentValue: model, options: [{ group: 'test', name: 'Local models', options: [{ value: 'slow', name: 'Slow model' }, { value: 'fast', name: 'Fast model' }, { value: 'plain', name: 'No reasoning' }] }] },
  ...(model === 'plain' ? [] : [{ id: 'reasoning_effort', category: 'thought_level', name: 'Effort', type: 'select', currentValue: effort, options: (model === 'slow' ? ['medium', 'high'] : ['low', 'medium']).map(value => ({ value, name: value })) }]),
];
const packet = '# Local test episode\n\n## SCENE 01\nA sun and a tree.\n## SCENE 02\nThe camera pulls back.\n## Layer Map\nSky, tree, ground.\n## Camera Plan\nSlow pull-back.\n## Master Voice-over\n```text\nA short local test.\n```\n';
const scene = "import React from 'react';\nimport {AbsoluteFill, useCurrentFrame} from 'remotion';\nexport default function Episode(){const frame=useCurrentFrame();return <AbsoluteFill style={{background:'#79c8ef'}}><svg viewBox='0 0 1080 1920'><circle cx={300+frame} cy='400' r='110' fill='#ffe18a'/><path d='M0 1200 Q540 900 1080 1200 V1920 H0Z' fill='#7ca75b'/><path d='M520 1300 V800' stroke='#7d513a' strokeWidth='50'/><circle cx='520' cy='700' r='220' fill='#357a54'/></svg></AbsoluteFill>;}\n";
for await (const line of readline.createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.method === 'initialize') reply(message.id, { protocolVersion: 1, agentCapabilities: {}, authMethods: [] });
  else if (message.method === 'session/new') { cwd = message.params.cwd; reply(message.id, { sessionId: 'pipeline-test', ...(configured ? { configOptions: choices() } : {}), ...(legacy ? { models: { currentModelId: model, availableModels: [{ modelId: 'slow', name: 'Slow' }, { modelId: 'fast', name: 'Fast' }] } } : {}) }); }
  else if (message.method === 'session/set_config_option' && configured) {
    if (!process.argv.includes('--ignore-config')) {
      const option = choices().find(option => option.id === message.params.configId);
      const valid = option && (option.id === 'model' ? ['slow', 'fast', 'plain'].includes(message.params.value) : option.options.some(choice => choice.value === message.params.value));
      if (!valid) { send({ id: message.id, error: { code: -32602, message: 'Unsupported choice' } }); continue; }
      if (option.id === 'model') { model = message.params.value; effort = model === 'slow' ? 'high' : 'medium'; } else effort = message.params.value;
    }
    reply(message.id, { configOptions: choices() });
  }
  else if (message.method === 'session/set_model' && legacy) { model = message.params.modelId; reply(message.id, {}); }
  else if (message.method === 'session/prompt') {
    if (process.argv.includes('--expect-config') && (model !== 'fast' || effort !== 'low')) { send({ id: message.id, error: { code: -32602, message: 'Prompt used the wrong model/effort' } }); continue; }
    fs.writeFileSync(path.join(cwd, 'test-execution.json'), JSON.stringify({ model, effort }));
    const text = message.params.prompt.map(block => block.text ?? '').join('');
    const stage = text.startsWith('Create the complete') ? 'script' : text.startsWith('Prepare narration') ? 'tags' : 'scenes';
    const filename = stage === 'script' ? '01-episode.md' : stage === 'tags' ? '02-naskah-tagged.md' : 'remotion/Episode.tsx';
    pending = { promptId: message.id, filename, content: stage === 'script' ? packet : stage === 'tags' ? '[curious] A short local test.\n' : scene };
    for (const text of ['Preparing ', 'local episode.']) send({ method: 'session/update', params: { sessionId: 'pipeline-test', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } } });
    send({ id: 9000, method: 'session/request_permission', params: { sessionId: 'pipeline-test', toolCall: { toolCallId: 'write-artifact', title: `Write ${filename}`, kind: 'edit', rawInput: { path: filename } }, options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }, { optionId: 'deny', name: 'Reject', kind: 'reject_once' }] } });
  } else if (message.method === 'session/cancel') {
    if (pending) reply(pending.promptId, { stopReason: 'cancelled' });
    pending = null;
  } else if (message.id === 9000 && pending) {
    if (message.result?.outcome?.optionId === 'allow') {
      const target = path.join(cwd, pending.filename);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, pending.content);
    }
    reply(pending.promptId, { stopReason: 'end_turn' });
    pending = null;
  }
}
