// ──────────────────────────────────────────────────────────────────────────────
// components/settings/ProviderSettings.tsx
// Global-tier provider switching UI per provider_strategy.md §4.1.
//
// Per contract:
//   - Active provider dropdown (catalogued candidates)
//   - is_active toggle (greyed-out for inactive — discoverability per OQ3)
//   - Health badges:
//       ✓ env key set + adapter implemented      → real call possible
//       ⚠ env key missing                        → resolver auto-mock
//       🚧 adapter not yet implemented           → currently mock-only
//
// On change → optimistic UI → PUT /api/providers/assignments/[contract] →
// invalidate resolver cache. Audit row created server-side.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Wrench, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { PeekHint } from '@/components/ui/PeekHint';
import { fetcher } from '@/lib/swr';
import type { ProviderCandidate } from '@/lib/api/provider-catalog';

interface AssignmentRow {
  contract: string;
  active_provider_id: string;
  is_active: boolean;
  updated_at: string;
  notes: string | null;
  candidates: ProviderCandidate[];
  active_provider: ProviderCandidate | null;
  env_ok: boolean;
  effective_provider_id: string;
}

const CONTRACT_LABEL: Record<string, string> = {
  image: 'Image',
  video: 'Video',
  character_video: 'Character video',
  music: 'Music',
  sfx: 'SFX',
  storage: 'Storage',
  publish: 'Publish',
};

const CONTRACT_NOTE: Record<string, string> = {
  image: 'YouTube thumbnails, character variants, reference frames.',
  video: 'Establishing shots, backgrounds, abstract clips.',
  character_video: 'Shots containing approved characters (D-001).',
  music: 'Episode score, scene music.',
  sfx: 'Comedic sound effects, transitions, foley.',
  storage: 'Where binaries land. Drive in Phase 8 step 10.',
  publish: 'Final destination — YouTube + crossposts.',
};

function HealthBadge({ row }: { row: AssignmentRow }) {
  const adapter = row.active_provider?.adapter_ready ?? false;
  if (!adapter) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
        style={{
          background: 'color-mix(in oklab, var(--accent-warning) 14%, transparent)',
          color: 'var(--accent-warning)',
        }}
        title="Adapter not yet implemented — resolver will fall back to mock"
      >
        <Wrench size={10} /> wip
      </span>
    );
  }
  if (!row.env_ok) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
        style={{
          background: 'color-mix(in oklab, var(--accent-warning) 14%, transparent)',
          color: 'var(--accent-warning)',
        }}
        title={`Env var ${row.active_provider?.envKey} is not set — resolver will fall back to mock`}
      >
        <AlertTriangle size={10} /> no key
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{
        background: 'color-mix(in oklab, var(--accent-success) 14%, transparent)',
        color: 'var(--accent-success)',
      }}
      title="Real adapter ready and env key present"
    >
      <CheckCircle2 size={10} /> live
    </span>
  );
}

export function ProviderSettings() {
  const { data, mutate, isLoading } = useSWR<{ data: AssignmentRow[] }>(
    '/api/providers/assignments',
    fetcher,
  );
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(
    contract: string,
    patch: { active_provider_id?: string; is_active?: boolean },
  ): Promise<void> {
    setPending(contract);
    setError(null);
    try {
      const current = data?.data.find((r) => r.contract === contract);
      const body = {
        active_provider_id: patch.active_provider_id ?? current?.active_provider_id,
        is_active: patch.is_active ?? current?.is_active,
      };
      const res = await fetch(`/api/providers/assignments/${contract}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `Update failed (${res.status})`);
      }
      await mutate();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              Providers
            </h2>
            <PeekHint autoPeekMs={3500}>
              Global tier — applies to every episode unless overridden per-stage. Resolver cache
              invalidates on save.
            </PeekHint>
          </div>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {error && (
          <p
            className="text-xs mb-3 px-3 py-2 rounded-lg"
            style={{
              background: 'color-mix(in oklab, var(--accent-danger) 10%, transparent)',
              color: 'var(--accent-danger)',
            }}
          >
            {error}
          </p>
        )}

        {data?.data && (
          <div className="space-y-2">
            {data.data.map((row) => {
              const isUpdating = pending === row.contract;
              const dim = !row.is_active ? 'opacity-50' : '';
              return (
                <div
                  key={row.contract}
                  className={`grid grid-cols-12 gap-3 items-center px-3 py-2 rounded-lg border border-glass ${dim}`}
                  style={{ background: 'var(--bg-elevated)' }}
                >
                  <div className="col-span-3">
                    <div className="text-sm font-medium text-text-primary">
                      {CONTRACT_LABEL[row.contract] ?? row.contract}
                    </div>
                    <div className="text-[11px] text-text-muted leading-tight">
                      {CONTRACT_NOTE[row.contract] ?? ''}
                    </div>
                  </div>

                  <div className="col-span-5">
                    <select
                      value={row.active_provider_id}
                      disabled={isUpdating || !row.is_active}
                      onChange={(e) =>
                        update(row.contract, { active_provider_id: e.target.value })
                      }
                      className="w-full h-9 px-2.5 rounded-lg bg-[var(--panel-glass-strong-bg)] border border-glass text-sm"
                    >
                      {row.candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.display_name}
                          {c.cost_hint ? ` — ${c.cost_hint}` : ''}
                          {!c.adapter_ready && c.id !== 'mock' ? ' (wip)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2 flex items-center gap-2">
                    <HealthBadge row={row} />
                    {row.effective_provider_id !== row.active_provider_id && (
                      <span
                        className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          background: 'color-mix(in oklab, var(--accent-info) 12%, transparent)',
                          color: 'var(--accent-info)',
                        }}
                        title={`Resolver currently delivers '${row.effective_provider_id}'`}
                      >
                        →{row.effective_provider_id}
                      </span>
                    )}
                  </div>

                  <div className="col-span-2 flex justify-end">
                    <button
                      onClick={() =>
                        update(row.contract, { is_active: !row.is_active })
                      }
                      disabled={isUpdating}
                      className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40"
                      title={row.is_active ? 'Deactivate contract' : 'Activate contract'}
                    >
                      {row.is_active ? (
                        <>
                          <ToggleRight size={18} style={{ color: 'var(--accent-success)' }} />
                          on
                        </>
                      ) : (
                        <>
                          <ToggleLeft size={18} />
                          off
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-text-muted mt-4 leading-relaxed">
          <strong>Live</strong> = adapter wired + env key set; real provider call.
          {' '}
          <strong>No key</strong> = adapter ready, but env var missing — resolver auto-falls back
          to mock so the pipeline keeps moving.
          {' '}
          <strong>Wip</strong> = adapter not yet implemented (the dropdown lists future options).
          {' '}
          Per-stage overrides will appear in the pipeline kebab when Phase 8 step 9 ships.
        </p>
      </CardBody>
    </Card>
  );
}
