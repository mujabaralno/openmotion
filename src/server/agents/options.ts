import { randomUUID } from 'node:crypto';
import { AcpSession } from '../acp/client.ts';
import type { AgentExecutionOptions } from '../acp/configuration.ts';

export async function discoverAgentOptions(input: { agentId: string; episodeSlug: string; modelId?: string | null; workspaceRoot?: string; workingDirectory?: 'episode' | 'remotion'; signal?: AbortSignal }): Promise<AgentExecutionOptions> {
  const session = new AcpSession({ sessionId: `options-${randomUUID()}`, agentId: input.agentId, episodeSlug: input.episodeSlug, workspaceRoot: input.workspaceRoot, workingDirectory: input.workingDirectory, initializeTimeoutMs: 15000 });
  const signal = AbortSignal.any([AbortSignal.timeout(45000), ...(input.signal ? [input.signal] : [])]);
  const abort = () => { void session.close(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    await session.start();
    if (input.modelId) await session.configure({ modelId: input.modelId });
    signal.throwIfAborted();
    return session.configuration;
  } finally {
    signal.removeEventListener('abort', abort);
    await session.close();
  }
}
