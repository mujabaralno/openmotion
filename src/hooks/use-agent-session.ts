"use client";

import { useEffect, useRef, useState } from 'react';
import { emptyAgentSession, reduceAgentSession, type SessionConnection } from '@/lib/agent-session';
import { studioRequest } from '@/lib/studio-api';
import type { AgentStreamEvent, PermissionRecord } from '@/server/agent-streams/types';
import type { StepKind } from '@/server/db';

export function useAgentSession(episodeSlug: string, kind: StepKind) {
  const [state, setState] = useState(emptyAgentSession);
  const [connection, setConnection] = useState<SessionConnection>('connecting');
  const [actionError, setActionError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});
  const [autoPending, setAutoPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const seen = useRef(new Set<string>());
  const attempt = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let terminal = false;
    const source = new EventSource(`/api/episodes/${encodeURIComponent(episodeSlug)}/steps/${kind}/stream`);
    const handleEvent = (event: Event) => {
      if (disposed) return;
      const incoming = event as MessageEvent<string>;
      let data: AgentStreamEvent;
      try { data = JSON.parse(incoming.data); } catch { return; }
      if (data.attemptId && data.attemptId !== attempt.current) { attempt.current = data.attemptId; seen.current.clear(); }
      const id = incoming.lastEventId || `${data.attemptId}:${data.seq}`;
      if (!seen.current.has(id)) {
        seen.current.add(id);
        setState(current => reduceAgentSession(current, data));
      }
      if (data.type === 'status' && data.status !== 'running') {
        terminal = true; setConnection('done'); source.close();
      }
    };
    for (const name of ['prompt', 'update', 'status', 'permission', 'permission-mode']) source.addEventListener(name, handleEvent);
    source.onopen = () => { if (!disposed && !terminal) setConnection('open'); };
    source.onerror = () => { if (!disposed && !terminal) setConnection(source.readyState === EventSource.CLOSED ? 'error' : 'reconnecting'); };
    return () => { disposed = true; source.close(); };
  }, [episodeSlug, kind, retry]);

  async function decide(permissionId: string, decision: 'approve' | 'reject') {
    if (deciding[permissionId]) return;
    setDeciding(current => ({ ...current, [permissionId]: true }));
    setActionError(null);
    try {
      const result = await studioRequest<{permission:PermissionRecord}>(`/api/permissions/${encodeURIComponent(permissionId)}`, 'POST', { decision });
      setState(current => ({ ...current, permissions: { ...current.permissions, [permissionId]: result.permission } }));
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Keputusan izin belum tersimpan. Coba lagi.'); }
    finally { setDeciding(current => { const next = { ...current }; delete next[permissionId]; return next; }); }
  }
  async function toggleAutoApprove() {
    if (autoPending || state.status !== 'running') return;
    setAutoPending(true); setActionError(null);
    try {
      const result = await studioRequest<{enabled:boolean}>(`/api/episodes/${encodeURIComponent(episodeSlug)}/steps/${kind}/permissions/auto`, 'POST', { enabled: !state.autoApprove });
      setState(current => ({ ...current, autoApprove: result.enabled }));
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Mode izin belum dapat diubah.'); }
    finally { setAutoPending(false); }
  }
  function reconnect() { setConnection('connecting'); setActionError(null); setRetry(current => current + 1); }
  return { state, connection, actionError, deciding, autoPending, decide, toggleAutoApprove, reconnect };
}
