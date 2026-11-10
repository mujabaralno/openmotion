export async function studioRequest<T>(url: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  if (method !== 'GET') {
    const security = await fetch('/api/security/session', { cache: 'no-store', credentials: 'same-origin', signal });
    if (!security.ok) throw new Error('Sesi keamanan belum siap. Muat ulang halaman.');
  }
  const response = await fetch(url, { method, cache: 'no-store', credentials: 'same-origin', signal, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error([data.error, data.fix].filter(Boolean).join(' ') || 'Permintaan gagal.');
  return data as T;
}
