// ──────────────────────────────────────────────────────────────────────────────
// components/episode/EpisodeSettingsCard.tsx
// TD-49 Phase 2 P2.3 (2026-05-25) — Director-facing toggle card on the
// episode detail page. v1 surface: one boolean — `anchor_chain_enabled`.
//
// Backed by /api/episodes/[id]/settings (GET hydrate + PATCH save). State is
// local-optimistic with rollback on PATCH failure. Mimics the pattern of
// StorageSettings (useState + fetch).
//
// Design intent (per plan): a quiet, single-toggle card that doesn't compete
// with the pipeline DAG below it. Helper text explains the toggle's
// architectural meaning so Director doesn't need to remember the q-numbers.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { PeekHint } from '@/components/ui/PeekHint';

interface EpisodeSettingsCardProps {
  episodeId: string;
  /** Initial metadata from the page-level episode payload — used to hydrate
   *  without an extra fetch on first render. The component then refetches via
   *  the settings GET to stay consistent with the canonical write surface. */
  initialMetadata?: Record<string, unknown> | null;
}

interface SettingsState {
  anchor_chain_enabled: boolean;
}

function readAnchorChainEnabled(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta || typeof meta !== 'object') return false;
  return meta.anchor_chain_enabled === true;
}

export function EpisodeSettingsCard({ episodeId, initialMetadata }: EpisodeSettingsCardProps) {
  const [state, setState] = useState<SettingsState>({
    anchor_chain_enabled: readAnchorChainEnabled(initialMetadata ?? null),
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/episodes/${episodeId}/settings`)
      .then((r) => r.json())
      .then((j: { data?: { metadata?: Record<string, unknown> } }) => {
        if (cancelled || !j.data) return;
        setState({
          anchor_chain_enabled: readAnchorChainEnabled(j.data.metadata ?? null),
        });
      })
      .catch(() => {
        // Non-fatal — keep initialMetadata-derived state.
      });
    return () => {
      cancelled = true;
    };
  }, [episodeId]);

  async function toggleAnchorChain(next: boolean) {
    const previous = state.anchor_chain_enabled;
    setState({ ...state, anchor_chain_enabled: next });
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ anchor_chain_enabled: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      // Rollback on failure.
      setState({ ...state, anchor_chain_enabled: previous });
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-text-muted" />
          <CardTitle>Episode Settings</CardTitle>
          <PeekHint autoPeekMs={3500}>
            Per-episode toggles that change pipeline behaviour. Director-only.
          </PeekHint>
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--accent-primary)] cursor-pointer"
              checked={state.anchor_chain_enabled}
              onChange={(e) => toggleAnchorChain(e.target.checked)}
              disabled={pending}
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-text-primary">
                Anchor Chain (TD-49 Phase 2)
              </div>
              <div className="text-xs text-text-muted mt-0.5 leading-relaxed">
                When enabled, EREF Designer authors paired start+end anchors per shot using
                walking-forward narrative order. EREF Artist generates IMG-anchor_* assets with
                scene_master as layout reference. VANIM fan-out gates on 2 × shotCount Director
                approvals. Requires Series Bible scene_master OR LOCKED location asset for every
                shot location.
              </div>
              {error && (
                <div className="text-xs text-[var(--accent-danger)] mt-1.5">
                  Error: {error}
                </div>
              )}
              {pending && (
                <div className="text-xs text-text-muted mt-1.5">Saving…</div>
              )}
            </div>
          </label>
        </div>
      </CardBody>
    </Card>
  );
}
