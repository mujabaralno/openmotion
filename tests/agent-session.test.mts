import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyAgentSession, reduceAgentSession, sessionPresentation, toolDisplayTitle, friendlySessionError } from '../src/lib/agent-session.ts';
import type { AgentStreamEvent, PermissionRecord } from '../src/server/agent-streams/types.ts';

const at = '2026-11-10T10:00:00.000Z';
const base = { attemptId: 'attempt-a', at };
const update = (seq: number, data: Record<string, unknown>): AgentStreamEvent => ({ ...base, seq, type: 'update', update: { sessionUpdate: 'agent_message_chunk', ...data } });
const status = (value: 'running' | 'completed' | 'failed', error?: string): AgentStreamEvent => ({ ...base, seq: 20, type: 'status', status: value, error });
const permission: PermissionRecord = { id: 'permission-a', attemptId: 'attempt-a', episodeSlug: 'episode-a', stepKind: 'script', stepId: 1, title: 'Write episode', summary: 'Write 01-episode.md', options: [], status: 'pending', auto: false, requestedAt: at };

test('message chunks join while tool calls separate conversation turns', () => {
  let state = reduceAgentSession(emptyAgentSession(), update(1, { content: { type: 'text', text: 'Reading ' } }));
  state = reduceAgentSession(state, update(2, { content: { type: 'text', text: 'the guide.' } }));
  state = reduceAgentSession(state, update(3, { sessionUpdate: 'tool_call', toolCallId: 'read-a', title: 'Read guide', status: 'in_progress' }));
  state = reduceAgentSession(state, update(4, { content: { type: 'text', text: 'Now assembling.' } }));
  state = reduceAgentSession(state, update(5, { sessionUpdate: 'tool_call_update', toolCallId: 'read-a', status: 'completed' }));
  assert.deepEqual(state.entries.map(entry => entry.type), ['message', 'tool', 'message']);
  assert.equal(state.entries[0].type === 'message' && state.entries[0].text, 'Reading the guide.');
  assert.equal(state.entries[1].type === 'tool' && state.entries[1].status, 'completed');
});

test('a permission wait pauses the working animation and resumes after the decision', () => {
  let state = reduceAgentSession(emptyAgentSession(), status('running'));
  state = reduceAgentSession(state, { ...base, seq: 2, type: 'permission', permission });
  const waiting = sessionPresentation(state, 'open');
  assert.equal(waiting.kind, 'waiting'); assert.equal(waiting.animate, false);
  state = reduceAgentSession(state, { ...base, seq: 3, type: 'permission', permission: { ...permission, status: 'approved' } });
  assert.equal(sessionPresentation(state, 'open').kind, 'working');
});

test('disconnection never claims the agent is still working', () => {
  const state = reduceAgentSession(emptyAgentSession(), status('running'));
  const view = sessionPresentation(state, 'reconnecting', { pipelineStatus: 'running' });
  assert.equal(view.kind, 'reconnecting'); assert.equal(view.animate, false);
  assert.match(view.description, /belum dapat dipastikan/);
});

test('failed and cancelled sessions have a single unambiguous terminal state', () => {
  let state = reduceAgentSession(emptyAgentSession(), status('failed', 'Renderer failed.'));
  assert.equal(sessionPresentation(state, 'done').kind, 'failed');
  state = reduceAgentSession(state, status('failed', 'Sesi dibatalkan pengguna.'));
  assert.equal(sessionPresentation(state, 'done').kind, 'stopped');
  state = reduceAgentSession(state, status('completed'));
  assert.equal(sessionPresentation(state, 'done').kind, 'completed');
});

test('terminal state expires pending permissions and turns off auto approval', () => {
  let state = reduceAgentSession(emptyAgentSession(), { ...base, seq: 1, type: 'permission', permission });
  state = reduceAgentSession(state, { ...base, seq: 2, type: 'permission-mode', enabled: true });
  state = reduceAgentSession(state, status('failed', 'Cancelled'));
  assert.equal(state.permissions['permission-a'].status, 'expired');
  assert.equal(state.autoApprove, false);
  assert.equal(sessionPresentation(state, 'done').animate, false);
});

test('new attempts do not inherit messages, permissions, or auto approval', () => {
  let state = reduceAgentSession(emptyAgentSession(), { ...base, seq: 1, type: 'permission', permission });
  state = reduceAgentSession(state, { ...base, seq: 2, type: 'permission-mode', enabled: true });
  state = reduceAgentSession(state, { ...base, attemptId: 'attempt-b', seq: 1, type: 'prompt', text: 'New attempt' });
  assert.equal(state.attemptId, 'attempt-b'); assert.equal(state.entries.length, 1);
  assert.deepEqual(state.permissions, {}); assert.equal(state.autoApprove, false);
});

test('long silence is explained without changing a running session to a fake failure', () => {
  const state = reduceAgentSession(emptyAgentSession(), status('running'));
  const view = sessionPresentation(state, 'open', { now: Date.parse(at) + 60000 });
  assert.equal(view.kind, 'working'); assert.match(view.description, /Belum ada pembaruan/);
});

test('permission and tool updates do not claim that the agent has just written text', () => {
  let state = reduceAgentSession(emptyAgentSession(), update(1, { content: { type: 'text', text: 'One message' } }));
  state = reduceAgentSession(state, { ...base, at: '2026-11-10T10:01:00.000Z', seq: 2, type: 'permission', permission });
  assert.equal(state.lastTextAt, at); assert.notEqual(state.lastActivityAt, at);
});

test('tool labels retain filenames even when the agent sends a generic completion title', () => {
  let state = reduceAgentSession(emptyAgentSession(), update(1, { sessionUpdate: 'tool_call', toolCallId: 'read-a', title: 'Read:', rawInput: { file_path: '/Users/name/workspace/guide/style.md' }, status: 'in_progress' }));
  state = reduceAgentSession(state, update(2, { sessionUpdate: 'tool_call_update', toolCallId: 'read-a', title: 'Read:', status: 'completed' }));
  const tool = state.entries[0]; assert.equal(tool.type, 'tool');
  if (tool.type === 'tool') assert.equal(toolDisplayTitle(tool), 'Read: …/guide/style.md');
});

test('installation stack traces have a readable primary message', () => {
  assert.equal(friendlySessionError('Missing optional dependency @openai/codex-darwin-arm64.\n at internal/...'), 'Instalasi Codex belum lengkap sehingga agen tidak dapat dimulai.');
});
