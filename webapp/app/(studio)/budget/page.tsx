// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/budget/page.tsx — the studio money board, wired to /api/budget.
//
// Restored 2026-07-25. Three things the previous version got wrong, all of which
// made money quietly invisible rather than loudly wrong:
//   1. No error branch — when /api/budget failed the page rendered its header and
//      nothing else, forever, with no reason shown. A broken money page must SAY
//      it is broken.
//   2. Only per-provider per-episode totals — episode-less spend (Bible images,
//      Bible enrich, global Polina) was counted in the headline but appeared
//      nowhere, so the columns never added up to the total.
//   3. No honesty surface — $0 mock rows read as "free" and the reserved-vs-
//      itemized gap was invisible.
//
// Theme tokens only, no hardcoded colors (CLAUDE.md §7.5).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, DollarSign, RefreshCw } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { fetcher } from '@/lib/swr';
import type { BudgetSummaryPayload } from '@/lib/budget-summary';
import { useWorkspaceScope } from '@/components/providers/WorkspaceScopeProvider';

type BudgetSummary = BudgetSummaryPayload & { generatedAt: string };
type BreakdownAxis = 'provider' | 'agent' | 'operation';

const usd = (n: number, d = 2): string =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(d)}`;

export default function BudgetPage() {
  // Scoped view = the series' episodes + their ledger rows. Episode-less spend
  // (global Polina, Bible) shows only in the unscoped «вся студия» view.
  const { seriesId } = useWorkspaceScope();
  const { data, error, isLoading, mutate, isValidating } = useSWR<{ data: BudgetSummary }>(
    seriesId ? `/api/budget?series_id=${seriesId}` : '/api/budget',
    fetcher,
    { refreshInterval: 60_000 },
  );
  const b = data?.data;
  const [axis, setAxis] = useState<BreakdownAxis>('provider');
  const [showArchived, setShowArchived] = useState(false);

  const episodes = (b?.byEpisode ?? []).filter((e) => showArchived || !e.archived);
  const archivedCount = (b?.byEpisode ?? []).filter((e) => e.archived).length;

  return (
    <StudioContentFrame>
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-text-secondary" />
            <h1 className="text-2xl font-semibold text-text-primary">Budget</h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Itemized spend per episode vs. ceiling, burn rate, projected runway.
            Every recorded dollar appears here — including Polina and studio-level
            spend.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void mutate()}
          className="flex items-center gap-1.5 rounded-lg border border-glass px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary"
        >
          <RefreshCw size={13} className={isValidating ? 'animate-spin' : undefined} />
          Refresh
        </button>
      </header>

      {isLoading && <p className="text-xs text-text-muted">Loading…</p>}

      {/* A money page that cannot load must say so, with the reason. */}
      {error && (
        <Card>
          <CardBody>
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} style={{ color: 'var(--accent-danger)' }} />
              <div>
                <div className="text-sm font-medium text-text-primary">
                  Budget data failed to load
                </div>
                <div className="text-xs font-mono mt-1 text-text-secondary">
                  {error instanceof Error ? error.message : String(error)}
                </div>
                <div className="text-[11px] text-text-muted mt-1.5">
                  Figures below (if any) are from the last successful read and may
                  be stale — do not treat them as current.
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {b && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <Stat
              label="Total spent"
              value={usd(b.totalSpent)}
              hint={`${b.counts.logRows} itemized calls`}
            />
            <Stat
              label="Allocated (active)"
              value={usd(b.totalAllocated)}
              hint={
                b.allocatedIncludingArchived !== b.totalAllocated
                  ? `${usd(b.allocatedIncludingArchived)} incl. archived`
                  : undefined
              }
            />
            <Stat
              label="Remaining"
              value={usd(b.remaining)}
              tone={b.remaining < 0 ? 'danger' : b.remaining < 5 ? 'warning' : 'default'}
              hint={b.remaining < 0 ? 'over the allocated ceiling' : undefined}
            />
            <Stat
              label="Burn / episode"
              value={usd(b.burnRate)}
              hint={
                b.projectedRunway === null
                  ? 'no shipped episodes yet'
                  : `~${b.projectedRunway} episodes runway`
              }
            />
          </div>

          {/* Where the money is, beyond the per-episode ceiling math. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <Stat
              label="Polina (concierge)"
              value={usd(b.conciergeTotal)}
              hint={
                b.totalSpent > 0
                  ? `${((b.conciergeTotal / b.totalSpent) * 100).toFixed(0)}% of all spend`
                  : undefined
              }
            />
            <Stat
              label="Studio-level (no episode)"
              value={usd(b.unattributed.total)}
              hint={`${b.unattributed.calls} calls — Bible images, enrich, global chat`}
            />
            <Stat
              label="Reserved ledger"
              value={usd(b.reservedTotal)}
              hint={`itemized ${usd(b.itemizedTotal)} · drift ${usd(b.gaps.totalDriftAbs)}`}
            />
          </div>

          <HonestyPanel summary={b} />

          {b.unattributed.calls > 0 && (
            <Card className="mb-3">
              <CardHeader>
                <CardTitle>Studio-level spend (not billed to an episode)</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="text-xs text-text-muted mb-2">
                  Series/Bible work and global Polina turns carry no{' '}
                  <code>episode_id</code>. This is real money that no episode
                  ceiling governs — it is counted in Total spent above.
                </p>
                <FoldList
                  folds={
                    axis === 'agent'
                      ? b.unattributed.byAgent
                      : axis === 'operation'
                        ? b.unattributed.byOperation
                        : b.unattributed.byProvider
                  }
                />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle>Per-episode breakdown</CardTitle>
                <div className="flex items-center gap-3">
                  {archivedCount > 0 && (
                    <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={(e) => setShowArchived(e.target.checked)}
                      />
                      show archived ({archivedCount})
                    </label>
                  )}
                  <AxisToggle axis={axis} onChange={setAxis} />
                </div>
              </div>
            </CardHeader>
            <CardBody>
              {episodes.length === 0 && (
                <p className="text-sm text-text-secondary">
                  No episodes to show. Create one to see spend tracking here.
                </p>
              )}
              <div className="grid gap-2">
                {episodes.map((e) => {
                  const ratio = e.ceiling && e.ceiling > 0 ? e.total / e.ceiling : 0;
                  const overrun = e.ceiling != null && e.total > e.ceiling;
                  const folds =
                    axis === 'agent'
                      ? e.byAgent
                      : axis === 'operation'
                        ? e.byOperation
                        : e.byProvider;
                  return (
                    <div
                      key={e.episode_id}
                      className="rounded-lg border border-glass bg-panel-glass-strong px-3 py-2.5"
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <span className="flex items-baseline gap-2">
                          <span className="text-sm font-mono text-text-primary">
                            {e.episode_code}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider text-text-muted">
                            {e.status}
                          </span>
                          {e.reservationOnly && e.reserved > 0 && (
                            <span
                              className="text-[10px] uppercase tracking-wider"
                              style={{ color: 'var(--accent-warning)' }}
                              title="No itemized ledger rows for this episode — the total comes from the reservation ledger and cannot be broken down."
                            >
                              reserved only
                            </span>
                          )}
                        </span>
                        <span
                          className="text-xs font-mono"
                          style={{
                            color: overrun
                              ? 'var(--accent-danger)'
                              : ratio > 0.8
                                ? 'var(--accent-warning)'
                                : 'var(--text-secondary)',
                          }}
                        >
                          {usd(e.total)}
                          {e.ceiling != null && (
                            <span className="text-text-muted"> / {usd(e.ceiling)}</span>
                          )}
                        </span>
                      </div>
                      {e.ceiling != null && (
                        <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, ratio * 100)}%`,
                              background: overrun
                                ? 'var(--accent-danger)'
                                : ratio > 0.8
                                  ? 'var(--accent-warning)'
                                  : 'var(--accent-primary)',
                            }}
                          />
                        </div>
                      )}
                      {folds.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
                          {folds.map((f) => (
                            <span key={f.key}>
                              {f.key}: {usd(f.costUsd)}
                              <span className="opacity-60"> ×{f.calls}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[10px] text-text-muted">
                        <span>{e.calls} calls</span>
                        {e.conciergeUsd > 0 && (
                          <span>Polina {usd(e.conciergeUsd)}</span>
                        )}
                        {!e.reservationOnly && Math.abs(e.drift) >= 0.01 && (
                          <span title="itemized − reserved. Polina's spend is expected here; a large gap is worth a look.">
                            drift {usd(e.drift)} (reserved {usd(e.reserved)})
                          </span>
                        )}
                        {e.zeroCostCalls > 0 && (
                          <span title="Calls recorded at exactly $0 — a mock or free-tier provider, not proof the work was free.">
                            {e.zeroCostCalls} × $0
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <p className="mt-3 text-[10px] text-text-muted font-mono">
            {b.counts.episodes} episodes · {b.counts.logRows} ledger rows · read{' '}
            {new Date(b.generatedAt).toLocaleTimeString()}
          </p>
        </>
      )}
    </StudioContentFrame>
  );
}

/**
 * The honesty surface: what this page KNOWS it cannot see. A money board that
 * only shows confident numbers is how a mocked provider ends up reading as free.
 */
function HonestyPanel({ summary }: { summary: BudgetSummary }) {
  const notes: string[] = [];
  if (summary.gaps.zeroCostCalls > 0) {
    const named = summary.gaps.zeroCostByProvider
      .slice(0, 4)
      .map((f) => `${f.key} ×${f.calls}`)
      .join(', ');
    notes.push(
      `${summary.gaps.zeroCostCalls} calls recorded at $0 (${named}). Mock or free-tier providers — a $0 line is a blind spot, not a saving.`,
    );
  }
  if (summary.gaps.reservationOnlyEpisodes.length > 0) {
    notes.push(
      `No itemized ledger rows for ${summary.gaps.reservationOnlyEpisodes.join(', ')} — their totals come from the reservation ledger and cannot be broken down by provider.`,
    );
  }
  if (summary.gaps.unpricedModels.length > 0) {
    const total = summary.gaps.unpricedModels.reduce((s, f) => s + f.costUsd, 0);
    notes.push(
      `${usd(total)} is attributed to models with no entry in the rate table (${summary.gaps.unpricedModels
        .map((f) => f.key)
        .join(', ')}). Those figures are the Sonnet fallback rate, not real prices — add the rates in lib/providers/anthropic-text.ts to make them true.`,
    );
  }
  if (summary.gaps.totalDriftAbs >= 0.01) {
    notes.push(
      `The itemized and reservation ledgers differ by ${usd(summary.gaps.totalDriftAbs)} in total. Polina's spend is excluded from reservations by design, so some drift is expected; the per-episode "drift" figure shows where it sits.`,
    );
  }
  if (notes.length === 0) return null;

  return (
    <Card className="mb-3">
      <CardHeader>
        <CardTitle>What this page cannot see</CardTitle>
      </CardHeader>
      <CardBody>
        <ul className="text-xs text-text-secondary space-y-1.5 list-disc pl-4">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function AxisToggle({
  axis,
  onChange,
}: {
  axis: BreakdownAxis;
  onChange: (a: BreakdownAxis) => void;
}) {
  const axes: BreakdownAxis[] = ['provider', 'agent', 'operation'];
  return (
    <div className="flex items-center gap-1 rounded-lg border border-glass p-0.5">
      {axes.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onChange(a)}
          className="rounded px-2 py-0.5 text-[11px] transition-colors"
          style={{
            background: axis === a ? 'var(--bg-elevated)' : 'transparent',
            color: axis === a ? 'var(--text-primary)' : 'var(--text-muted)',
          }}
        >
          by {a}
        </button>
      ))}
    </div>
  );
}

function FoldList({ folds }: { folds: Array<{ key: string; costUsd: number; calls: number }> }) {
  if (folds.length === 0) {
    return <p className="text-xs text-text-muted">nothing recorded</p>;
  }
  return (
    <div className="grid gap-1">
      {folds.map((f) => (
        <div key={f.key} className="flex items-baseline justify-between text-xs">
          <span className="text-text-secondary font-mono">{f.key}</span>
          <span className="text-text-primary font-mono">
            {usd(f.costUsd)}
            <span className="text-text-muted"> ×{f.calls}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const color =
    tone === 'danger'
      ? 'var(--accent-danger)'
      : tone === 'warning'
        ? 'var(--accent-warning)'
        : 'var(--text-primary)';
  return (
    <Card>
      <CardBody>
        <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
        <div className="text-xl font-semibold mt-1 font-mono" style={{ color }}>
          {value}
        </div>
        {hint && <div className="text-[11px] text-text-muted mt-1">{hint}</div>}
      </CardBody>
    </Card>
  );
}
