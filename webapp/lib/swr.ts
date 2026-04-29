// ──────────────────────────────────────────────────────────────────────────────
// lib/swr.ts
// Shared SWR fetcher for the studio webapp. Returns the standard envelope
// directly so components can read `data.data` / `data.meta`.
// ──────────────────────────────────────────────────────────────────────────────

export async function fetcher(url: string): Promise<unknown> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as { error?: string };
      detail = j.error ?? '';
    } catch {
      // ignore
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}
